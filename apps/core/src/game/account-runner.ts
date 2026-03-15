import type { StoreService } from '../store/store.service'
import type { AccountConfigSnapshot, IntervalsConfig } from './constants'
import type { GameConfigService } from './game-config.service'
import type { IGameTransport } from './interfaces/game-transport.interface'
import type { LinkClient } from './link-client'
import type { GameLogEntry, LinkEventMap, LinkEventName, LinkUserState, StatusEventData } from './types'
import { Logger } from '@nestjs/common'
import { Scheduler, syncServerTime } from '@qq-farm/shared'
import { GameSession } from './client-driven/session/game-session'
import { AnalyticsWorker } from './services/analytics.worker'
import { DailyRewardsWorker } from './services/daily-rewards.worker'
import { FriendWorker } from './services/friend.worker'
import { IllustratedWorker } from './services/illustrated.worker'
import { InviteWorker } from './services/invite.worker'
import { StatsTracker } from './services/stats.worker'
import { TaskWorker } from './services/task.worker'
import { getDateKey } from './utils'

export interface AccountRunnerConfig {
  code: string
  platform: string
}

export type StatusEventName = 'connection' | 'profile' | 'session' | 'operations' | 'schedule'

export interface AccountRunnerCallbacks {
  onStatusEvent?: (accountId: string, event: StatusEventName, data: StatusEventData, name?: string, callerRunner?: AccountRunner) => void
  onLog?: (entry: GameLogEntry) => void
  onAccountLog?: (entry: Record<string, unknown>) => void
  onKicked?: (accountId: string, reason: string) => void
  onWsError?: (accountId: string, code: number, message: string) => void
  onStopped?: (accountId: string) => void
  onLandsUpdate?: (accountId: string, data: unknown) => void
  onBagUpdate?: (accountId: string, data: unknown) => void
  onDailyGiftsUpdate?: (accountId: string, data: unknown) => void
  onFriendsUpdate?: (accountId: string, data: unknown) => void
  onAlmanacUpdate?: (accountId: string, data: unknown) => void
}

export class AccountRunner {
  private logger: Logger
  private transport!: IGameTransport
  private scheduler: Scheduler
  private stats: StatsTracker
  private analytics: AnalyticsWorker
  private session!: GameSession
  private friend!: FriendWorker
  private illustrated!: IllustratedWorker
  private task!: TaskWorker
  private dailyRewards!: DailyRewardsWorker
  private invite!: InviteWorker

  private isRunning = false
  private loginReady = false
  private unifiedRunning = false
  private farmTaskRunning = false
  private friendTaskRunning = false
  private nextFarmRunAt = 0
  private nextFriendRunAt = 0
  private lastDailyRunDate = ''
  private static readonly STATUS_FLUSH_DEBOUNCE_MS = 500
  private static readonly DAILY_CHECK_INTERVAL_MS = 30_000
  private appliedConfigRevision = 0

  private farmIntervalMin = 60_000
  private farmIntervalMax = 60_000
  private friendIntervalMin = 60_000
  private friendIntervalMax = 120_000

  private userState = { gid: 0, name: '', level: 0, gold: 0, exp: 0, coupon: 0, avatarUrl: '', openId: '', platform: 'qq' as string }

  name = ''

  constructor(
    readonly accountId: string,
    private linkClient: LinkClient,
    private gameConfig: GameConfigService,
    private store: StoreService,
    private callbacks: AccountRunnerCallbacks
  ) {
    this.logger = new Logger(`Runner:${accountId}`)
    this.scheduler = new Scheduler(`runner-${accountId}`, this.logger)
    this.stats = new StatsTracker(accountId)
    this.analytics = new AnalyticsWorker(gameConfig)
    this.linkEventHandlers = this.buildLinkEventHandlers()
  }

  private log(msg: string, event?: string) {
    this.logger.log(msg)
    this.callbacks.onLog?.({ msg, tag: '系统', meta: { module: 'system', ...(event && { event }) }, isWarn: false })
  }

  private warn(msg: string, event?: string) {
    this.logger.warn(msg)
    this.callbacks.onLog?.({ msg, tag: '系统', meta: { module: 'system', ...(event && { event }) }, isWarn: true })
  }

  private forwardLog = (entry: GameLogEntry) => this.callbacks.onLog?.(entry)

  // ========== Lifecycle ==========

  async start(config: AccountRunnerConfig) {
    if (this.isRunning)
      return
    this.isRunning = true

    this.transport = this.linkClient.createTransport(this.accountId, () => this.userState)
    this.session = new GameSession(this.accountId, this.transport, this.gameConfig, this.store, this.stats, this.analytics, {
      onLog: this.forwardLog,
      onLandsUpdate: data => this.callbacks.onLandsUpdate?.(this.accountId, data),
      onBagUpdate: data => this.callbacks.onBagUpdate?.(this.accountId, data)
    })
    this.friend = new FriendWorker(this.accountId, this.transport, this.gameConfig, this.store, this.stats, () => this.session.sellAllFruits(), config.platform)
    this.friend.onLog = this.forwardLog
    this.illustrated = new IllustratedWorker(this.accountId, this.transport, this.gameConfig)
    this.illustrated.onLog = this.forwardLog
    this.task = new TaskWorker(this.accountId, this.transport, this.gameConfig, this.store, this.stats, () => this.session.getRawBagItems())
    this.task.onLog = this.forwardLog
    this.dailyRewards = new DailyRewardsWorker(this.accountId, this.transport, this.gameConfig, this.store)
    this.dailyRewards.onLog = this.forwardLog
    this.invite = new InviteWorker(this.accountId, this.transport, config.platform)
    this.invite.onLog = this.forwardLog

    this.applyIntervals(this.store.getIntervals(this.accountId))

    this.log('正在连接服务器...', 'connect')

    try {
      let us: LinkUserState | undefined
      try {
        const meta = await this.linkClient.getAccountStatus(this.accountId)
        if (meta?.connected && meta.userState) {
          us = meta.userState
          this.log('恢复游戏连接', 'connect')
        }
      } catch (e) {
        this.logger.warn(`获取账号 ${this.accountId} Link 状态失败: ${(e as Error)?.message}`)
      }
      if (!us) {
        const runtimeCfg = this.store.getRuntimeClient()
        us = await this.linkClient.connectAccount(this.accountId, config.code, config.platform, runtimeCfg)
      }
      if (!this.isRunning)
        return
      if (us) {
        this.userState = { ...this.userState, ...us }

        this.loginReady = true
        this.name = this.userState.name || this.name
        this.log(`登录成功: ${this.userState.name || ''} (Lv${this.userState.level ?? ''})`, 'login')

        await this.session.bootstrap()
        if (!this.isRunning)
          return
        this.userState.coupon = Math.max(0, this.session.getCouponBalance())

        this.stats.initStats(Number(this.userState.gold || 0), Number(this.userState.exp || 0), Number(this.userState.coupon || 0))

        await this.invite.processInviteCodes().catch(e => this.logger.warn(`处理邀请码失败: ${e?.message}`))
        if (!this.isRunning)
          return
        const auto = this.store.getAutomation(this.accountId)
        if (auto.fertilizer_gift)
          await this.session.autoOpenFertilizerGiftPacks().catch(e => this.logger.warn(`自动开启化肥礼包失败: ${e?.message}`))
        if (!this.isRunning)
          return

        this.friend.startFriendLoop({ externalScheduler: true })
        this.task.init()
        this.startUnifiedScheduler()
        this.startDailyRoutineTimer()

        this.syncStatusAtomic()
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
    this.session?.destroy()
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
        await this.session.runScheduledAutomationPass()
    } catch (e: any) {
      this.warn(`农场调度执行失败: ${e?.message}`, 'schedule_error')
    } finally {
      this.nextFarmRunAt = Date.now() + this.randomInterval(this.farmIntervalMin, this.farmIntervalMax)
      this.farmTaskRunning = false
      this.syncStatusAfterTick()
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
      this.syncStatusAfterTick()
      this.pushFriends().catch(() => {})
    }
  }

  /** best-effort: 推送好友数据到前端，失败不影响主流程 */
  private async pushFriends() {
    try {
      const friends = await this.getFriends()
      if (friends != null)
        this.callbacks.onFriendsUpdate?.(this.accountId, friends)
    } catch {}
  }

  /** best-effort: 鎺ㄩ€佸浘閴存暟鎹埌鍓嶇锛屽け璐ヤ笉褰卞搷涓绘祦绋? */
  private async pushAlmanac(refresh = false) {
    try {
      const overview = await this.getAlmanac(refresh)
      if (overview != null)
        this.callbacks.onAlmanacUpdate?.(this.accountId, overview)
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
      const tasks: Promise<void>[] = []
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
      if (auto.fertilizer_gift)
        await this.session.autoOpenFertilizerGiftPacks()
      if (auto.fertilizer_buy) {
        const cfg = this.store.getAccountConfig(this.accountId).fertilizerBuy
        await this.dailyRewards.autoBuyFertilizer(cfg)
      }
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
      if (overview != null)
        this.callbacks.onDailyGiftsUpdate?.(this.accountId, overview)
    } catch (e: any) {
      this.warn(`每日任务调度失败: ${e?.message}`, 'schedule_error')
    }
  }

  private startDailyRoutineTimer() {
    this.stopDailyRoutineTimer()
    this.lastDailyRunDate = getDateKey()
    this.runDailyRoutines(true).catch(() => {})
    this.scheduler.setIntervalTask('daily_routine_interval', AccountRunner.DAILY_CHECK_INTERVAL_MS, () => {
      if (!this.loginReady)
        return
      const today = getDateKey()
      if (today === this.lastDailyRunDate)
        return
      this.lastDailyRunDate = today
      this.runDailyRoutines(true).catch(() => {})
    })
  }

  private stopDailyRoutineTimer() {
    this.scheduler.clear('daily_routine_interval')
  }

  // ========== Config ==========

  applyIntervals(intervals: IntervalsConfig) {
    const farmMin = Math.max(1, intervals.farmMin ?? intervals.farm ?? 60)
    const farmMax = Math.max(farmMin, intervals.farmMax ?? farmMin)
    this.farmIntervalMin = farmMin * 1000
    this.farmIntervalMax = farmMax * 1000
    const friendMin = Math.max(1, intervals.friendMin ?? intervals.friend ?? 10)
    const friendMax = Math.max(friendMin, intervals.friendMax ?? 10)
    this.friendIntervalMin = friendMin * 1000
    this.friendIntervalMax = friendMax * 1000
  }

  applyConfig(snapshot: Partial<AccountConfigSnapshot> & { __revision?: number }) {
    const rev = Number(snapshot?.__revision || 0)
    if (rev > 0)
      this.appliedConfigRevision = rev

    if (snapshot?.intervals)
      this.applyIntervals(snapshot.intervals)

    if (this.loginReady) {
      this.session.onConfigChanged()
      this.friend.refreshFriendLoop(200)
      this.resetSchedule()
      this.scheduleNext()

      if (snapshot?.automation) {
        const auto = this.store.getAutomation(this.accountId)
        const cfg = this.store.getAccountConfig(this.accountId)
        const allDailyOn = auto.email && auto.free_gifts && auto.share_reward && auto.vip_gift && auto.month_card && auto.open_server_gift
        if (allDailyOn) {
          this.scheduler.setTimeoutTask('daily_routine_immediate', 400, () => this.runDailyRoutines(true).catch(() => {}))
        }
        const fert = String(cfg.fertilizer || '').toLowerCase()
        if (fert === 'both' || fert === 'organic') {
          this.scheduler.setTimeoutTask('fertilizer_immediate', 600, async () => {
            if (this.loginReady)
              await this.session.runFarmOperation('all').catch(() => {})
          })
        }
      }
    }
    this.emitSchedule()
  }

  // ========== Events (from LinkClient) ==========

  private linkEventHandlers: { [E in LinkEventName]?: (data: LinkEventMap[E]) => void } = {}

  private buildLinkEventHandlers(): { [E in LinkEventName]?: (data: LinkEventMap[E]) => void } {
    return {
      kicked: data => this.onKickout(data),
      ws_error: data => this.onWsError(data),
      reconnecting: data => this.log(`WS 断开，正在重连 (${data.attempt}/${data.maxAttempts})...`, 'reconnecting'),
      disconnected: () => {
        if (this.loginReady) {
          this.loginReady = false
          this.emitConnection()
        }
      },
      login_failed: (data) => {
        this.warn(`登录失败: ${data.error || '未知原因'}，code 可能已过期`, 'login_failed')
        if (this.loginReady) {
          this.loginReady = false
          this.emitConnection()
        }
      },
      connected: (data) => {
        if (data) {
          this.userState = { ...this.userState, ...data }
          this.loginReady = true
          this.syncStatusAtomic()
        }
      },
      state_update: (data) => {
        if (data && typeof data === 'object') {
          const oldLevel = this.userState.level
          const merged = { ...this.userState, ...data }
          if (Number(data.coupon) === 0 && Number(this.userState.coupon) > 0)
            merged.coupon = this.userState.coupon
          this.userState = merged

          if (merged.level != null && merged.level > oldLevel && oldLevel > 0) {
            this.stats.recordOperation('levelUp', 1)
            this.log(`账号升级至 Lv${merged.level}`, 'level_up')
          }
          this.deferStatusFlush()
        }
      },
      notify: (data) => {
        const kind = String(data?.kind || '')
        if (kind === 'illustrated_reward' || kind === 'illustrated_change')
          this.scheduler.setTimeoutTask('almanac_notify_refresh', 300, () => this.pushAlmanac(true))
        this.session?.handleNotify(data)
      },
      taskInfoNotify: (data) => {
        this.transport.emit('taskInfoNotify', data)
      },
      server_time: (data) => {
        const ms = Number((data as any)?.ms || 0)
        if (ms > 0) {
          syncServerTime(ms)
          this.session?.handleServerTime(ms)
        }
      }
    }
  }

  handleLinkEvent<E extends LinkEventName>(event: E, data: LinkEventMap[E]) {
    const handler = this.linkEventHandlers[event] as ((d: LinkEventMap[E]) => void) | undefined
    handler?.(data)
  }

  private onKickout(payload: LinkEventMap['kicked']) {
    const reason = payload.reason || '未知'
    this.warn(`被踢下线: ${reason}`, 'kickout')
    this.callbacks.onKicked?.(this.accountId, reason)
    this.scheduler.setTimeoutTask('kickout_stop', 200, () => this.stop())
  }

  private onWsError(payload: LinkEventMap['ws_error']) {
    if (payload.code !== 400)
      return
    this.warn('连接被拒绝，可能需要更新 Code', 'connect')
    this.callbacks.onWsError?.(this.accountId, payload.code, payload.message || '')
    if (this.isRunning)
      this.scheduler.setTimeoutTask('ws_error_cleanup', 1000, () => this.stop())
  }

  // ========== Status (atomic events) ==========

  private emitStatusEvent(event: StatusEventName, data: StatusEventData) {
    this.callbacks.onStatusEvent?.(this.accountId, event, data, this.name, this)
  }

  private emitConnection() {
    const connected = this.isConnected()
    const payload = { connected, accountName: this.name }
    this.emitStatusEvent('connection', payload)
  }

  private emitProfile() {
    const us = this.userState
    const data = {
      name: us.name,
      level: us.level || 0,
      gold: us.gold || 0,
      exp: us.exp || 0,
      coupon: us.coupon || 0,
      platform: us.platform || 'qq',
      avatarUrl: us.avatarUrl || '',
      openId: us.openId || ''
    }
    this.emitStatusEvent('profile', data)
  }

  private emitSession() {
    const connected = this.isConnected()
    const us = this.userState
    const limits = this.friend?.getOperationLimits?.() || {}
    const fullStats = this.stats.getStats(us, connected, limits)
    const levelProgress = this.gameConfig.getLevelExpProgress(us.level || 0, us.exp || 0)
    const data = {
      bootAt: this.stats.getBootAt(),
      sessionExpGained: fullStats.sessionExpGained,
      sessionGoldGained: fullStats.sessionGoldGained,
      sessionCouponGained: fullStats.sessionCouponGained,
      lastExpGain: fullStats.lastExpGain,
      lastGoldGain: fullStats.lastGoldGain,
      levelProgress
    }
    this.emitStatusEvent('session', data)
  }

  private emitOperations() {
    const connected = this.isConnected()
    const us = this.userState
    const limits = this.friend?.getOperationLimits?.() || {}
    const fullStats = this.stats.getStats(us, connected, limits)
    const ops = fullStats.operations
    this.emitStatusEvent('operations', { ...ops })
  }

  private deferStatusFlush() {
    this.scheduler.setTimeoutTask(
      'status_flush',
      AccountRunner.STATUS_FLUSH_DEBOUNCE_MS,
      () => this.flushDeferredStatus()
    )
  }

  private flushDeferredStatus() {
    this.emitProfile()
    this.emitSession()
  }

  private emitSchedule() {
    const nowMs = Date.now()
    const data = {
      farmRemainSec: Math.max(0, Math.ceil((this.nextFarmRunAt - nowMs) / 1000)),
      friendRemainSec: Math.max(0, Math.ceil((this.nextFriendRunAt - nowMs) / 1000)),
      configRevision: this.appliedConfigRevision
    }
    this.emitStatusEvent('schedule', data)
  }

  /** Full snapshot for initial push / getStatus (no automation, no preferredSeed) */
  getStatusSnapshot() {
    const connected = this.isConnected()
    const us = this.userState
    const limits = this.friend?.getOperationLimits?.() || {}
    const fullStats = this.stats.getStats(us, connected, limits)
    const levelProgress = this.gameConfig.getLevelExpProgress(us.level || 0, us.exp || 0)
    const { uptime: _dropped, ...rest } = fullStats
    return {
      ...rest,
      bootAt: this.stats.getBootAt(),
      levelProgress,
      configRevision: this.appliedConfigRevision,
      nextChecks: {
        nextFarmRunAt: this.nextFarmRunAt,
        nextFriendRunAt: this.nextFriendRunAt
      }
    }
  }

  private syncStatusAtomic() {
    this.emitConnection()
    this.emitProfile()
    this.emitSession()
    this.emitOperations()
    this.emitSchedule()
  }

  private syncStatusAfterTick() {
    this.scheduler.clear('status_flush')
    this.flushDeferredStatus()
    this.emitSession()
    this.emitOperations()
    this.emitSchedule()
  }

  // ========== API Calls (from controllers) ==========

  async getLands() { return this.session.getLandsDetail() }
  async getSeeds() { return this.session.getAvailableSeeds() }
  async getBagSeeds() { return this.session.getBagSeeds() }
  async doFarmOp(opType: string) { return await this.session.runFarmOperation(opType) }

  async doSingleLandOp(payload: { action: string, landId: number, seedId: number }) {
    return await this.session.runSingleLandOperation(payload)
  }

  async getFriends() { return this.friend.getFriendsList() }
  async getFriendLands(gid: number) { return this.friend.getFriendLandsDetail(gid) }
  async getAlmanac(refresh = false) { return this.illustrated.getOverview(refresh) }
  async claimAlmanacRewards() {
    const result = await this.illustrated.claimRewards()
    this.pushAlmanac(true).catch(() => {})
    return result
  }

  async doFriendOp(gid: number, opType: string) {
    const result = await this.friend.doFriendOperation(gid, opType)
    this.pushFriends().catch(() => {})
    return result
  }

  async getInteractRecords() {
    return this.friend.getInteractRecords()
  }

  async getBag() { return this.session.getBagDetail() }

  async sellItem(itemId: number, count: number) {
    const result = await this.session.sellItem(itemId, count)
    this.stats.recordOperation('sell', count)
    return result
  }

  async buySeed(goodsId: number, count: number, price: number) {
    return await this.session.buySeed(goodsId, count, price)
  }

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
