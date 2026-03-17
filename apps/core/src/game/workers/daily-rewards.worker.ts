import type { DailyRoutineRunOptions } from '../../account/runner/account-runner-ticks'
import type { GameConfigService } from '../game-config.service'
import type { IGameTransport } from '../interfaces/game-transport.interface'
import { Logger } from '@nestjs/common'
import { GameRpcExecutor } from '../rpc/game-rpc-executor'
import { getDateKey, getRewardSummary } from '../utils'

export class DailyRewardsWorker {
  private logger: Logger
  private readonly CHECK_COOLDOWN_MS = 10 * 60 * 1000
  private readonly rpc: GameRpcExecutor

  private emailDone = ''
  private emailLastCheck = 0
  private monthCardDone = ''
  private monthCardLastCheck = 0
  private monthCardLastClaim = 0
  private openServerDone = ''
  private openServerLastCheck = 0
  private openServerLastClaim = 0
  private vipDone = ''
  private vipLastCheck = 0
  private vipLastClaim = 0
  private shareDone = ''
  private shareLastCheck = 0
  private shareLastClaim = 0
  private freeGiftDone = ''
  private freeGiftLastCheck = 0
  private fertBuyDone = ''
  private fertBuyLastSuccess = 0
  private fertBuyPausedNoGold = ''

  onLog: ((entry: { msg: string, tag?: string, meta?: Record<string, string>, isWarn?: boolean }) => void) | null = null

  constructor(
    private accountId: string,
    private client: IGameTransport,
    private gameConfig: GameConfigService,
    private store?: any,
    private platform = 'qq'
  ) {
    this.logger = new Logger(`DailyRewards:${accountId}`)
    this.rpc = new GameRpcExecutor(this.client)
  }

  private log(msg: string, event?: string) {
    this.logger.log(msg)
    this.onLog?.({ msg, tag: '任务', meta: { module: 'task', ...(event && { event }) }, isWarn: false })
  }

  private warn(msg: string, event?: string) {
    this.logger.warn(msg)
    this.onLog?.({ msg, tag: '任务', meta: { module: 'task', ...(event && { event }) }, isWarn: true })
  }

  private shouldLogNoop(options?: DailyRoutineRunOptions): boolean {
    return options?.suppressNoopLogs !== true
  }

  // ========== Email ==========

  async checkAndClaimEmails(options: DailyRoutineRunOptions = {}): Promise<{ claimed: number, rewardItems: number }> {
    const { force = false } = options
    const now = Date.now()
    if (!force && this.emailDone === getDateKey())
      return { claimed: 0, rewardItems: 0 }
    if (!force && now - this.emailLastCheck < this.CHECK_COOLDOWN_MS)
      return { claimed: 0, rewardItems: 0 }
    this.emailLastCheck = now

    try {
      const getEmailList = async (boxType: number): Promise<any> => {
        const { data } = await this.rpc.call('daily.email.getEmailList', { box_type: boxType })
        return data ?? { emails: [] }
      }

      const [box1, box2] = await Promise.all([
        getEmailList(1).catch(() => ({ emails: [] })),
        getEmailList(2).catch(() => ({ emails: [] }))
      ])

      const merged = new Map<string, any>()
      for (const x of [...(box1.emails || []).map((e: any) => ({ ...e, __boxType: 1 })), ...(box2.emails || []).map((e: any) => ({ ...e, __boxType: 2 }))]) {
        if (!x?.id)
          continue
        if (!merged.has(x.id)) {
          merged.set(x.id, x)
          continue
        }
        const old = merged.get(x.id)
        if (!(old?.has_reward && !old?.claimed) && (x?.has_reward && !x?.claimed))
          merged.set(x.id, x)
      }

      const claimable = [...merged.values()].filter(x => x?.has_reward === true && x?.claimed !== true)
      if (claimable.length === 0) {
        this.emailDone = getDateKey()
        if (this.shouldLogNoop(options))
          this.log('今日暂无可领取邮箱奖励', 'email_rewards')
        return { claimed: 0, rewardItems: 0 }
      }

      const rewards: any[] = []
      let claimed = 0

      // batch claim by box type
      const byBox = new Map<number, any[]>()
      for (const m of claimable) {
        const bt = m.__boxType === 2 ? 2 : 1
        if (!byBox.has(bt))
          byBox.set(bt, [])
        byBox.get(bt)!.push(m)
      }
      for (const [bt, list] of byBox) {
        try {
          const firstId = String(list[0]?.id || '')
          if (!firstId)
            continue
          const { data: rep } = await this.rpc.call<any>('daily.email.batchClaimEmail', { box_type: bt, email_id: firstId })
          if ((rep as any)?.items?.length)
            rewards.push(...(rep as any).items)
          claimed++
        } catch {}
      }

      for (const m of claimable) {
        const bt = m.__boxType === 2 ? 2 : 1
        try {
          const { data: rep } = await this.rpc.call<any>('daily.email.claimEmail', { box_type: bt, email_id: String(m.id || '') })
          if ((rep as any)?.items?.length)
            rewards.push(...(rep as any).items)
          claimed++
        } catch {}
      }

      if (claimed > 0) {
        const rewardStr = getRewardSummary(rewards, id => this.gameConfig.getItemName(id))
        this.log(rewardStr ? `邮箱领取成功 ${claimed} 封 → ${rewardStr}` : `邮箱领取成功 ${claimed} 封`, 'email_rewards')
        this.emailDone = getDateKey()
      }
      return { claimed, rewardItems: rewards.length }
    } catch (e: any) {
      this.warn(`领取邮箱奖励失败: ${e?.message}`, 'email_rewards')
      return { claimed: 0, rewardItems: 0 }
    }
  }

  // ========== Month Card ==========

  async performDailyMonthCardGift(options: DailyRoutineRunOptions = {}): Promise<boolean> {
    const { force = false } = options
    const now = Date.now()
    if (!force && this.monthCardDone === getDateKey())
      return false
    if (!force && now - this.monthCardLastCheck < this.CHECK_COOLDOWN_MS)
      return false
    this.monthCardLastCheck = now

    try {
      const { data: rep } = await this.rpc.call<any>('daily.mall.getMonthCardInfos', {})
      const infos = (rep as any)?.infos || []
      const claimable = infos.filter((x: any) => x?.can_claim && Number(x.goods_id || 0) > 0)

      if (!claimable.length) {
        this.monthCardDone = getDateKey()
        if (this.shouldLogNoop(options))
          this.log(infos.length ? '今日暂无可领取月卡礼包' : '当前没有月卡或已过期', 'month_card_gift')
        return false
      }

      let claimed = 0
      for (const info of claimable) {
        try {
          const { data: ret } = await this.rpc.call<any>('daily.mall.claimMonthCardReward', { goods_id: Number(info.goods_id) })
          const reward = getRewardSummary((ret as any)?.items || [], id => this.gameConfig.getItemName(id))
          this.log(reward ? `月卡领取成功 → ${reward}` : '月卡领取成功', 'month_card_gift')
          claimed++
        } catch (e: any) {
          this.warn(`月卡领取失败: ${e?.message}`, 'month_card_gift')
        }
      }

      if (claimed > 0) {
        this.monthCardLastClaim = Date.now()
        this.monthCardDone = getDateKey()
      }
      return claimed > 0
    } catch (e: any) {
      this.warn(`月卡礼包：${(e?.message || '功能暂不可用')}`, 'month_card_gift')
      return false
    }
  }

  // ========== Open Server Gift ==========

  async performDailyOpenServerGift(options: DailyRoutineRunOptions = {}): Promise<boolean> {
    const { force = false } = options
    const now = Date.now()
    if (!force && this.openServerDone === getDateKey())
      return false
    if (!force && now - this.openServerLastCheck < this.CHECK_COOLDOWN_MS)
      return false
    this.openServerLastCheck = now

    try {
      const { data: status } = await this.rpc.call<any>('daily.redpacket.getTodayClaimStatus', {})
      const claimable = ((status as any)?.infos || []).filter((x: any) => x?.can_claim && Number(x.id || 0) > 0)

      if (!claimable.length) {
        this.openServerDone = getDateKey()
        if (this.shouldLogNoop(options))
          this.log('今日暂无可领取开服红包', 'open_server_gift')
        return false
      }

      let claimed = 0
      for (const info of claimable) {
        try {
          const { data: ret } = await this.rpc.call<any>('daily.redpacket.claimRedPacket', { id: Number(info.id) })
          const items = (ret as any)?.item ? [(ret as any).item] : []
          const reward = getRewardSummary(items, id => this.gameConfig.getItemName(id))
          this.log(reward ? `开服红包领取成功 → ${reward}` : '开服红包领取成功', 'open_server_gift')
          claimed++
        } catch (e: any) {
          const msg = String(e?.message || '')
          if (msg.includes('已领取') || msg.includes('次数已达上限')) {
            this.openServerDone = getDateKey()
            break
          }
          this.warn(`开服红包领取失败: ${msg}`, 'open_server_gift')
        }
      }

      if (claimed > 0) {
        this.openServerLastClaim = Date.now()
        this.openServerDone = getDateKey()
      }
      return claimed > 0
    } catch (e: any) {
      this.warn(`开服红包：${(e?.message || '功能暂不可用')}`, 'open_server_gift')
      return false
    }
  }

  // ========== VIP Gift ==========

  async performDailyVipGift(options: DailyRoutineRunOptions = {}): Promise<boolean> {
    const { force = false } = options
    const now = Date.now()
    if (!force && this.vipDone === getDateKey())
      return false
    if (!force && now - this.vipLastCheck < this.CHECK_COOLDOWN_MS)
      return false
    this.vipLastCheck = now

    try {
      const { data: status } = await this.rpc.call<any>('daily.qqvip.getDailyGiftStatus', {})

      if (!(status as any)?.can_claim) {
        this.vipDone = getDateKey()
        if (this.shouldLogNoop(options))
          this.log('今日暂无可领取会员礼包', 'vip_daily_gift')
        return false
      }

      const { data: rep } = await this.rpc.call<any>('daily.qqvip.claimDailyGift', {})
      const reward = getRewardSummary((rep as any)?.items || [], id => this.gameConfig.getItemName(id))
      this.log(reward ? `会员礼包领取成功 → ${reward}` : '会员礼包领取成功', 'vip_daily_gift')
      this.vipLastClaim = Date.now()
      this.vipDone = getDateKey()
      return true
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (msg.includes('已领取')) {
        this.vipDone = getDateKey()
        return false
      }
      this.warn(`会员礼包：${(msg || '功能暂不可用')}`, 'vip_daily_gift')
      return false
    }
  }

  // ========== Share ==========

  async performDailyShare(options: DailyRoutineRunOptions = {}): Promise<boolean> {
    const { force = false } = options
    const now = Date.now()
    if (!force && this.shareDone === getDateKey())
      return false
    if (!force && now - this.shareLastCheck < this.CHECK_COOLDOWN_MS)
      return false
    this.shareLastCheck = now

    if (this.platform !== 'wx') {
      this.shareDone = getDateKey()
      if (this.shouldLogNoop(options))
        this.log('当前为 QQ 环境，跳过分享奖励（仅微信支持）', 'daily_share')
      return false
    }

    try {
      const { data: can } = await this.rpc.call<any>('daily.share.checkCanShare', {})
      if (!(can as any)?.can_share) {
        this.shareDone = getDateKey()
        if (this.shouldLogNoop(options))
          this.log('今日暂无可领取分享礼包', 'daily_share')
        return false
      }

      const { data: report } = await this.rpc.call<any>('daily.share.reportShare', { share_channel: 1 })
      if (!(report as any)?.result?.success) {
        this.warn('上报分享状态失败', 'daily_share')
        return false
      }

      const { data: rep } = await this.rpc.call<any>('daily.share.claimShareReward', { claimed: true })
      if (!(rep as any)?.state?.success) {
        this.warn('领取分享礼包失败', 'daily_share')
        return false
      }

      const reward = getRewardSummary((rep as any)?.items || [], id => this.gameConfig.getItemName(id))
      this.log(reward ? `分享领取成功 → ${reward}` : '分享领取成功', 'daily_share')
      this.shareLastClaim = Date.now()
      this.shareDone = getDateKey()
      return true
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (msg.includes('code=1009001') || msg.includes('分享奖励已经领取')) {
        this.shareDone = getDateKey()
        if (this.shouldLogNoop(options))
          this.log('分享奖励已经领取', 'daily_share')
      } else {
        this.warn(`分享奖励：${(msg || '功能暂不可用')}`, 'daily_share')
      }
      return false
    }
  }

  // ========== Free Gifts (Mall) ==========

  async buyFreeGifts(options: DailyRoutineRunOptions = {}): Promise<number> {
    const { force = false } = options
    const now = Date.now()
    if (!force && this.freeGiftDone === getDateKey())
      return 0
    if (!force && now - this.freeGiftLastCheck < this.CHECK_COOLDOWN_MS)
      return 0
    this.freeGiftLastCheck = now

    try {
      const { data: mall } = await this.rpc.call<any>('daily.mall.getMallListBySlotType', { slot_type: 1 })
      const goods = (mall as any)?.goods_list || []
      const free = goods.filter((g: any) => g?.is_free === true && Number(g.goods_id || 0) > 0)
      if (!free.length) {
        this.freeGiftDone = getDateKey()
        if (this.shouldLogNoop(options))
          this.log('今日暂无可领取免费礼包', 'mall_free_gifts')
        return 0
      }

      let bought = 0
      for (const g of free) {
        try {
          await this.rpc.call('daily.mall.purchase', { goods_id: Number(g.goods_id), count: 1 })
          bought++
        } catch {}
      }
      this.freeGiftDone = getDateKey()
      if (bought > 0) {
        this.log(`自动购买免费礼包 x${bought}`, 'mall_free_gifts')
      }
      return bought
    } catch (e: any) {
      this.warn(`免费礼包：${(e?.message || '功能暂不可用')}`, 'mall_free_gifts')
      return 0
    }
  }

  // ========== Fertilizer Buy ==========

  private static readonly BUY_COOLDOWN_MS = 60_000
  private static readonly ORGANIC_FERTILIZER_MALL_GOODS_ID = 1002
  private static readonly NORMAL_FERTILIZER_MALL_GOODS_ID = 1003
  private static readonly MAX_ROUNDS = 20
  private static readonly BUY_PER_ROUND = 10
  private lastBuyAt = 0

  async autoBuyFertilizer(config: import('../constants').FertilizerBuyConfig, force = false): Promise<number> {
    const today = getDateKey()
    if (!force && this.fertBuyDone === today)
      return 0
    const now = Date.now()
    if (!force && now - this.lastBuyAt < DailyRewardsWorker.BUY_COOLDOWN_MS)
      return 0
    this.lastBuyAt = now
    try {
      const { data: mall } = await this.rpc.call<any>('daily.mall.getMallListBySlotType', { slot_type: 1 })
      const goods = (mall as any)?.goods_list || []
      const types: Array<{ id: number, label: string }> = []
      if (config.type === 'organic' || config.type === 'both')
        types.push({ id: DailyRewardsWorker.ORGANIC_FERTILIZER_MALL_GOODS_ID, label: '有机化肥' })
      if (config.type === 'normal' || config.type === 'both')
        types.push({ id: DailyRewardsWorker.NORMAL_FERTILIZER_MALL_GOODS_ID, label: '普通化肥' })
      if (!types.length)
        return 0

      // 无限模式下不允许 both
      if (config.mode === 'unlimited' && config.type === 'both')
        types.splice(1) // 保留第一个

      let totalBought = 0
      for (const { id, label } of types) {
        const target = goods.find((g: any) => Number(g?.goods_id || 0) === id)
        if (!target)
          continue
        let rounds = 0
        while (rounds < config.max) {
          try {
            await this.rpc.call('daily.mall.purchase', { goods_id: id, count: DailyRewardsWorker.BUY_PER_ROUND })
            totalBought += DailyRewardsWorker.BUY_PER_ROUND
          } catch {
            break
          }
          rounds++
        }
        if (totalBought > 0)
          this.log(`自动购买${label} x${totalBought}`, 'fertilizer_buy')
      }

      if (totalBought > 0) {
        this.fertBuyDone = getDateKey()
        this.fertBuyLastSuccess = Date.now()
      }
      return totalBought
    } catch { return 0 }
  }

  // ========== Daily State Getters ==========

  getEmailDailyState() { return { key: 'email_rewards', doneToday: this.emailDone === getDateKey(), lastCheckAt: this.emailLastCheck } }
  getMonthCardDailyState() { return { key: 'month_card_gift', doneToday: this.monthCardDone === getDateKey(), lastClaimAt: this.monthCardLastClaim } }
  getOpenServerDailyState() { return { key: 'open_server_gift', doneToday: this.openServerDone === getDateKey(), lastClaimAt: this.openServerLastClaim } }
  getVipDailyState() { return { key: 'vip_daily_gift', doneToday: this.vipDone === getDateKey(), lastClaimAt: this.vipLastClaim } }
  getShareDailyState() { return { key: 'daily_share', doneToday: this.shareDone === getDateKey(), lastClaimAt: this.shareLastClaim } }
  getFreeGiftDailyState() { return { key: 'mall_free_gifts', doneToday: this.freeGiftDone === getDateKey() } }
  getFertilizerBuyDailyState() { return { key: 'fertilizer_buy', doneToday: this.fertBuyDone === getDateKey(), pausedNoGoldToday: this.fertBuyPausedNoGold === getDateKey(), lastSuccessAt: this.fertBuyLastSuccess } }
}
