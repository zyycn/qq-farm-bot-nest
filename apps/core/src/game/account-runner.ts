import type { StoreService } from '../store/store.service'
import type { IntervalsConfig } from './constants'
import type { GameConfigService } from './game-config.service'
import type { IGameTransport } from './interfaces/game-transport.interface'
import type { LinkClient } from './link-client'
import type { ProtoService } from './proto.service'
import { Logger } from '@nestjs/common'
import { Scheduler } from './scheduler'
import { AnalyticsWorker } from './services/analytics.worker'
import { DailyRewardsWorker } from './services/daily-rewards.worker'
import { FarmWorker } from './services/farm.worker'
import { FriendWorker } from './services/friend.worker'
import { InviteWorker } from './services/invite.worker'
import { StatsTracker } from './services/stats.worker'
import { TaskWorker } from './services/task.worker'
import { WarehouseWorker } from './services/warehouse.worker'
import { toNum } from './utils'

export interface AccountRunnerConfig {
  code: string
  platform: string
}

export interface AccountRunnerCallbacks {
  onStatusSync?: (accountId: string, status: any, name: string, callerRunner?: AccountRunner) => void
  onLog?: (entry: any) => void
  onAccountLog?: (entry: any) => void
  onKicked?: (accountId: string, reason: string) => void
  onWsError?: (accountId: string, code: number, message: string) => void
  onStopped?: (accountId: string) => void
  onLandsUpdate?: (accountId: string, data: any) => void
  onBagUpdate?: (accountId: string, data: any) => void
  onDailyGiftsUpdate?: (accountId: string, data: any) => void
  onFriendsUpdate?: (accountId: string, data: any) => void
}

export class AccountRunner {
  private logger: Logger
  private transport!: IGameTransport
  private scheduler: Scheduler
  private stats: StatsTracker
  private analytics: AnalyticsWorker
  private farm!: FarmWorker
  private friend!: FriendWorker
  private task!: TaskWorker
  private warehouse!: WarehouseWorker
  private dailyRewards!: DailyRewardsWorker
  private invite!: InviteWorker

  private isRunning = false
  private loginReady = false
  private unifiedRunning = false
  private farmTaskRunning = false
  private friendTaskRunning = false
  private nextFarmRunAt = 0
  private nextFriendRunAt = 0
  private lastStatusHash = ''
  private lastStatusSentAt = 0
  private lastDailyRunDate = ''
  private appliedConfigRevision = 0

  private farmIntervalMin = 2000
  private farmIntervalMax = 2000
  private friendIntervalMin = 10_000
  private friendIntervalMax = 10_000

  private userState = { gid: 0, name: '', level: 0, gold: 0, exp: 0, coupon: 0, avatarUrl: '', openId: '' }

  name = ''

  constructor(
    readonly accountId: string,
    private linkClient: LinkClient,
    private proto: ProtoService,
    private gameConfig: GameConfigService,
    private store: StoreService,
    private callbacks: AccountRunnerCallbacks
  ) {
    this.logger = new Logger(`Runner:${accountId}`)
    this.scheduler = new Scheduler(`runner-${accountId}`)
    this.stats = new StatsTracker(accountId)
    this.analytics = new AnalyticsWorker(gameConfig)
  }

  private log(msg: string, event?: string) {
    this.logger.log(msg)
    this.callbacks.onLog?.({ msg, tag: '系统', meta: { module: 'system', ...(event && { event }) }, isWarn: false })
  }

  private warn(msg: string, event?: string) {
    this.logger.warn(msg)
    this.callbacks.onLog?.({ msg, tag: '系统', meta: { module: 'system', ...(event && { event }) }, isWarn: true })
  }

  private forwardLog = (entry: any) => this.callbacks.onLog?.(entry)

  private syncTransportUserState() {
    if (this.transport?.userState)
      Object.assign(this.transport.userState, this.userState)
  }

  // ========== Lifecycle ==========

  async start(config: AccountRunnerConfig) {
    if (this.isRunning)
      return
    this.isRunning = true

    this.transport = this.linkClient.createTransport(this.accountId)
    this.warehouse = new WarehouseWorker(this.accountId, this.transport, this.gameConfig, this.store)
    this.warehouse.onLog = this.forwardLog
    this.farm = new FarmWorker(this.accountId, this.transport, this.gameConfig, this.store, this.stats, this.analytics)
    this.farm.onLog = this.forwardLog
    this.friend = new FriendWorker(this.accountId, this.transport, this.gameConfig, this.store, this.stats, this.farm, this.warehouse, config.platform)
    this.friend.onLog = this.forwardLog
    this.task = new TaskWorker(this.accountId, this.transport, this.gameConfig, this.store, this.stats, this.warehouse)
    this.task.onLog = this.forwardLog
    this.dailyRewards = new DailyRewardsWorker(this.accountId, this.transport, this.gameConfig, this.store)
    this.dailyRewards.onLog = this.forwardLog
    this.invite = new InviteWorker(this.accountId, this.transport, config.platform)
    this.invite.onLog = this.forwardLog

    this.applyIntervals(this.store.getIntervals(this.accountId))

    this.log('正在连接服务器...', 'connect')

    try {
      let us: any = null
      try {
        const meta = await this.linkClient.getAccountStatus(this.accountId)
        if (meta?.connected && meta.userState) {
          us = meta.userState
          this.log('恢复游戏连接', 'connect')
        }
      } catch {}
      if (!us) {
        us = await this.linkClient.connectAccount(this.accountId, config.code, config.platform)
      }
      if (!this.isRunning)
        return
      if (us) {
        this.userState = { ...this.userState, ...us }
        this.syncTransportUserState()
        this.loginReady = true
        this.name = this.userState.name || this.name
        this.log(`登录成功: ${this.userState.name || ''} (Lv${this.userState.level ?? ''})`, 'login')

        try {
          const rep = await this.warehouse.getBag()
          if (!this.isRunning)
            return
          const items = this.warehouse.getBagItems(rep)
          let coupon = 0
          for (const it of (items || [])) {
            if (toNum(it?.id) === 1002) {
              coupon = toNum(it.count)
              break
            }
          }
          this.userState.coupon = Math.max(0, coupon)
          this.syncTransportUserState()
        } catch {}

        this.stats.initStats(Number(this.userState.gold || 0), Number(this.userState.exp || 0), Number(this.userState.coupon || 0))

        await this.invite.processInviteCodes().catch(() => {})
        if (!this.isRunning)
          return
        const auto = this.store.getAutomation(this.accountId)
        if (auto.fertilizer_gift)
          await this.warehouse.autoOpenFertilizerGiftPacks().catch(() => 0)
        if (!this.isRunning)
          return

        this.farm.startFarmLoop({ externalScheduler: true })
        this.friend.startFriendLoop({ externalScheduler: true })
        this.task.init()
        this.startUnifiedScheduler()
        this.startDailyRoutineTimer()

        this.syncStatus()
        this.pushLandsAndBag().catch(() => {})
      }
    } catch (e: any) {
      this.warn(`连接失败: ${e?.message}`, 'connect')
    }
  }

  async stop() {
    if (!this.isRunning)
      return
    this.isRunning = false
    this.loginReady = false

    this.stopUnifiedScheduler()
    this.farm?.destroy()
    this.friend?.destroy()
    this.task?.destroy()
    this.stopDailyRoutineTimer()
    this.scheduler.clearAll()

    this.callbacks.onStopped?.(this.accountId)
  }

  isActive() { return this.isRunning }
  isConnected() { return this.loginReady && !!this.transport?.isConnected() }

  // ========== Unified Scheduler ==========

  private randomInterval(minMs: number, maxMs: number): number {
    const minSec = Math.max(1, Math.floor(Math.max(1000, minMs) / 1000))
    const maxSec = Math.max(minSec, Math.floor(Math.max(1000, maxMs) / 1000))
    if (maxSec === minSec)
      return minSec * 1000
    return (minSec + Math.floor(Math.random() * (maxSec - minSec + 1))) * 1000
  }

  private resetSchedule() {
    const now = Date.now()
    this.nextFarmRunAt = now + this.randomInterval(this.farmIntervalMin, this.farmIntervalMax)
    this.nextFriendRunAt = now + this.randomInterval(this.friendIntervalMin, this.friendIntervalMax)
  }

  private async runFarmTick() {
    if (this.farmTaskRunning)
      return
    this.farmTaskRunning = true
    try {
      const auto = this.store.getAutomation(this.accountId)
      if (auto.farm)
        await this.farm.checkFarm()
      if (auto.task)
        await this.task.checkAndClaimTasks()
      if (auto.email)
        await this.dailyRewards.checkAndClaimEmails()
      if (auto.fertilizer_gift)
        await this.warehouse.autoOpenFertilizerGiftPacks()
      if (auto.fertilizer_buy)
        await this.dailyRewards.autoBuyOrganicFertilizer()
      await this.warehouse.sellAllFruits()
    } catch (e: any) {
      this.warn(`农场调度执行失败: ${e?.message}`, 'schedule_error')
    } finally {
      this.nextFarmRunAt = Date.now() + this.randomInterval(this.farmIntervalMin, this.farmIntervalMax)
      this.farmTaskRunning = false
      this.syncStatus()
      this.pushLandsAndBag().catch(() => {})
    }
  }

  private async runFriendTick() {
    if (this.friendTaskRunning)
      return
    this.friendTaskRunning = true
    try {
      const auto = this.store.getAutomation(this.accountId)
      if (auto.friend_steal || auto.friend_help || auto.friend_bad)
        await this.friend.checkFriends()
    } catch (e: any) {
      this.warn(`好友调度执行失败: ${e?.message}`, 'schedule_error')
    } finally {
      this.nextFriendRunAt = Date.now() + this.randomInterval(this.friendIntervalMin, this.friendIntervalMax)
      this.friendTaskRunning = false
      this.syncStatus()
      this.pushFriends().catch(() => {})
    }
  }

  private async pushLandsAndBag() {
    try {
      const [lands, bag] = await Promise.all([this.getLands(), this.getBag()])
      if (lands)
        this.callbacks.onLandsUpdate?.(this.accountId, lands)
      if (bag)
        this.callbacks.onBagUpdate?.(this.accountId, bag)
    } catch {}
  }

  private async pushFriends() {
    try {
      const friends = await this.getFriends()
      if (friends != null)
        this.callbacks.onFriendsUpdate?.(this.accountId, friends)
    } catch {}
  }

  private scheduleNext() {
    if (!this.unifiedRunning || !this.loginReady)
      return
    this.scheduler.clear('unified_tick')
    const now = Date.now()
    const nextAt = Math.min(this.nextFarmRunAt || now + 1000, this.nextFriendRunAt || now + 1000)
    const delay = Math.max(1000, nextAt - now)
    this.scheduler.setTimeoutTask('unified_tick', delay, async () => {
      if (!this.unifiedRunning || !this.loginReady)
        return
      const now2 = Date.now()
      const tasks: Promise<any>[] = []
      if (now2 >= this.nextFarmRunAt)
        tasks.push(this.runFarmTick())
      if (now2 >= this.nextFriendRunAt)
        tasks.push(this.runFriendTick())
      if (tasks.length)
        await Promise.all(tasks)
      this.scheduleNext()
    })
  }

  private startUnifiedScheduler() {
    if (this.unifiedRunning)
      return
    this.unifiedRunning = true
    this.resetSchedule()
    this.scheduleNext()
  }

  private stopUnifiedScheduler() {
    this.unifiedRunning = false
    this.farmTaskRunning = false
    this.friendTaskRunning = false
    this.scheduler.clear('unified_tick')
  }

  // ========== Daily Routines ==========

  private async runDailyRoutines(force = false) {
    if (!this.loginReady)
      return
    const auto = this.store.getAutomation(this.accountId)
    try {
      if (auto.email)
        await this.dailyRewards.checkAndClaimEmails(force)
      if (auto.share_reward)
        await this.dailyRewards.performDailyShare(force)
      if (auto.month_card)
        await this.dailyRewards.performDailyMonthCardGift(force)
      if (auto.open_server_gift)
        await this.dailyRewards.performDailyOpenServerGift(force)
      if (auto.free_gifts)
        await this.dailyRewards.buyFreeGifts(force)
      if (auto.vip_gift)
        await this.dailyRewards.performDailyVipGift(force)
      const overview = await this.getDailyGiftOverview().catch(() => null)
      if (overview)
        this.callbacks.onDailyGiftsUpdate?.(this.accountId, overview)
    } catch (e: any) {
      this.warn(`每日任务调度失败: ${e?.message}`, 'schedule_error')
    }
  }

  private startDailyRoutineTimer() {
    this.stopDailyRoutineTimer()
    this.lastDailyRunDate = this.getLocalDateKey()
    this.runDailyRoutines(true).catch(() => {})
    this.scheduler.setIntervalTask('daily_routine_interval', 30_000, () => {
      if (!this.loginReady)
        return
      const today = this.getLocalDateKey()
      if (today === this.lastDailyRunDate)
        return
      this.lastDailyRunDate = today
      this.runDailyRoutines(true).catch(() => {})
    })
  }

  private stopDailyRoutineTimer() {
    this.scheduler.clear('daily_routine_interval')
  }

  private getLocalDateKey(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }

  // ========== Config ==========

  applyIntervals(intervals: IntervalsConfig) {
    const farmMin = Math.max(1, intervals.farmMin || intervals.farm || 2)
    const farmMax = Math.max(farmMin, intervals.farmMax || farmMin)
    this.farmIntervalMin = farmMin * 1000
    this.farmIntervalMax = farmMax * 1000
    const friendMin = Math.max(1, intervals.friendMin || intervals.friend || 10)
    const friendMax = Math.max(friendMin, intervals.friendMax || friendMin)
    this.friendIntervalMin = friendMin * 1000
    this.friendIntervalMax = friendMax * 1000
  }

  applyConfig(snapshot: any) {
    const rev = Number(snapshot?.__revision || 0)
    if (rev > 0)
      this.appliedConfigRevision = rev

    if (snapshot?.intervals)
      this.applyIntervals(snapshot.intervals)

    if (this.loginReady) {
      this.farm.refreshFarmLoop(200)
      this.friend.refreshFriendLoop(200)
      this.resetSchedule()
      this.scheduleNext()

      if (snapshot?.automation) {
        const auto = this.store.getAutomation(this.accountId)
        const allDailyOn = auto.email && auto.free_gifts && auto.share_reward && auto.vip_gift && auto.month_card && auto.open_server_gift
        if (allDailyOn) {
          this.scheduler.setTimeoutTask('daily_routine_immediate', 400, () => this.runDailyRoutines(true).catch(() => {}))
        }
        const fert = String(auto.fertilizer || '').toLowerCase()
        if (fert === 'both' || fert === 'organic') {
          this.scheduler.setTimeoutTask('fertilizer_immediate', 600, async () => {
            if (this.loginReady)
              await this.farm.runFertilizerByConfig([]).catch(() => {})
          })
        }
      }
    }
    this.syncStatus()
  }

  // ========== Events (from LinkClient) ==========

  handleLinkEvent(event: string, data: any) {
    switch (event) {
      case 'kicked':
        this.onKickout(data)
        break
      case 'ws_error':
        this.onWsError(data)
        break
      case 'reconnecting':
        this.log(`WS 断开，正在重连 (${data?.attempt}/${data?.maxAttempts})...`, 'reconnecting')
        break
      case 'disconnected':
        if (this.loginReady) {
          this.loginReady = false
          this.syncStatus()
        }
        break
      case 'login_failed':
        this.warn(`登录失败: ${data?.error || '未知原因'}，code 可能已过期`, 'login_failed')
        if (this.loginReady) {
          this.loginReady = false
          this.syncStatus()
        }
        break
      case 'connected':
        if (data) {
          this.userState = { ...this.userState, ...data }
          this.loginReady = true
          this.syncStatus()
        }
        break
      case 'state_update':
        if (data && typeof data === 'object') {
          const merged = { ...this.userState, ...data }
          // Link 登录响应不含 coupon，只有 ItemNotify(id=1002) 会更新；避免用 Link 的 0 覆盖 Core 已从 getBag 得到的点券
          if (Number(data.coupon) === 0 && Number(this.userState.coupon) > 0)
            merged.coupon = this.userState.coupon
          this.userState = merged
          this.syncTransportUserState()
          this.syncStatus()
        }
        break
    }
  }

  private onKickout(payload: any) {
    const reason = payload?.reason || '未知'
    this.warn(`被踢下线: ${reason}`, 'kickout')
    this.callbacks.onKicked?.(this.accountId, reason)
    this.scheduler.setTimeoutTask('kickout_stop', 200, () => this.stop())
  }

  private onWsError(payload: any) {
    const code = Number(payload?.code || 0)
    if (code !== 400)
      return
    this.warn('连接被拒绝，可能需要更新 Code', 'connect')
    this.callbacks.onWsError?.(this.accountId, code, payload?.message || '')
    if (this.isRunning)
      this.scheduler.setTimeoutTask('ws_error_cleanup', 1000, () => this.stop())
  }

  // ========== Status ==========

  private syncStatus() {
    if (!this.callbacks.onStatusSync)
      return
    const connected = this.isConnected()
    const us = this.userState
    const limits = this.friend?.getOperationLimits?.() || {}
    const fullStats = this.stats.getStats(us, connected, limits)

    const levelProgress = this.gameConfig.getLevelExpProgress(us.level || 0, us.exp || 0)

    const nowMs = Date.now()
    const data = {
      ...fullStats,
      automation: this.store.getAutomation(this.accountId),
      preferredSeed: this.store.getPreferredSeed(this.accountId),
      levelProgress,
      configRevision: this.appliedConfigRevision,
      nextChecks: {
        farmRemainSec: Math.max(0, Math.ceil((this.nextFarmRunAt - nowMs) / 1000)),
        friendRemainSec: Math.max(0, Math.ceil((this.nextFriendRunAt - nowMs) / 1000))
      }
    }

    const hash = JSON.stringify(data)
    const now = Date.now()
    if (hash !== this.lastStatusHash || now - this.lastStatusSentAt > 8000) {
      this.lastStatusHash = hash
      this.lastStatusSentAt = now
      this.callbacks.onStatusSync(this.accountId, data, this.name, this)
    }
  }

  // ========== API Calls (from controllers) ==========

  async getLands() { return this.farm.getLandsDetail() }
  async getSeeds() { return this.farm.getAvailableSeeds() }
  async doFarmOp(opType: string) {
    const result = await this.farm.runFarmOperation(opType)
    this.pushLandsAndBag().catch(() => {})
    return result
  }

  async getFriends() { return this.friend.getFriendsList() }
  async getFriendLands(gid: number) { return this.friend.getFriendLandsDetail(gid) }
  async doFriendOp(gid: number, opType: string) {
    const result = await this.friend.doFriendOperation(gid, opType)
    this.pushFriends().catch(() => {})
    return result
  }

  async getBag() { return this.warehouse.getBagDetail() }
  getAnalytics(sortBy: string) { return this.analytics.getPlantRankings(sortBy) }

  async getDailyGiftOverview() {
    const auto = this.store.getAutomation(this.accountId)
    const taskState = await this.task.getTaskDailyStateLikeApp()
    const growthState = await this.task.getGrowthTaskStateLikeApp()
    const emailState = this.dailyRewards.getEmailDailyState()
    const freeState = this.dailyRewards.getFreeGiftDailyState()
    const shareState = this.dailyRewards.getShareDailyState()
    const vipState = this.dailyRewards.getVipDailyState()
    const monthState = this.dailyRewards.getMonthCardDailyState()
    const openServerState = this.dailyRewards.getOpenServerDailyState()

    return {
      date: new Date().toISOString().slice(0, 10),
      growth: { key: 'growth_task', label: '成长任务', doneToday: !!growthState.doneToday, completedCount: growthState.completedCount, totalCount: growthState.totalCount, tasks: growthState.tasks },
      gifts: [
        { key: 'task_claim', label: '每日任务', enabled: !!auto.task, doneToday: !!taskState.doneToday, lastAt: taskState.lastClaimAt, completedCount: taskState.completedCount, totalCount: taskState.totalCount },
        { key: 'email_rewards', label: '邮箱奖励', enabled: !!auto.email, doneToday: !!emailState.doneToday, lastAt: emailState.lastCheckAt },
        { key: 'mall_free_gifts', label: '商城免费礼包', enabled: !!auto.free_gifts, doneToday: !!freeState.doneToday, lastAt: 0 },
        { key: 'daily_share', label: '分享礼包', enabled: !!auto.share_reward, doneToday: !!shareState.doneToday, lastAt: shareState.lastClaimAt },
        { key: 'vip_daily_gift', label: '会员礼包', enabled: !!auto.vip_gift, doneToday: !!vipState.doneToday, lastAt: vipState.lastClaimAt },
        { key: 'month_card_gift', label: '月卡礼包', enabled: !!auto.month_card, doneToday: !!monthState.doneToday, lastAt: monthState.lastClaimAt },
        { key: 'open_server_gift', label: '开服红包', enabled: !!auto.open_server_gift, doneToday: !!openServerState.doneToday, lastAt: openServerState.lastClaimAt }
      ]
    }
  }

  getStatus() {
    const connected = this.isConnected()
    const us = this.userState
    const limits = this.friend?.getOperationLimits?.() || {}
    return this.stats.getStats(us, connected, limits)
  }
}
