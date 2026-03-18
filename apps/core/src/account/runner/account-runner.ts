import type { ClientConfig } from '@qq-farm/shared/node'
import type { DeviceFingerprintService, ResolvedDeviceConfig } from '../../device/device-fingerprint'
import type { AccountConfigSnapshot, FertilizerBuyConfig } from '../../game/constants'
import type { GameConfigService } from '../../game/game-config.service'
import type { ConnectionEventData, GameLogEntry, LinkEventMap, LinkEventName, LinkUserState, OperationsEventData, ProfileEventData, StatusEventData } from '../../game/types'
import type { AccountConfigService } from '../../store/account-config.service'
import type { GlobalConfigService } from '../../store/global-config.service'
import type { IGameTransport } from '../../transport/interfaces/game-transport.interface'
import type { LinkClientService } from '../../transport/link-client.service'
import type { AccountStatusEventPayload } from '../account.events'
import type { WorkerSet } from './worker-factory'
import { Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Scheduler, syncServerTime } from '@qq-farm/shared'
import { getDateKey } from '../../game/utils'
import {
  ACCOUNT_DATA_ALMANAC_EVENT,
  ACCOUNT_DATA_BAG_EVENT,
  ACCOUNT_DATA_DAILY_GIFTS_EVENT,
  ACCOUNT_DATA_FRIENDS_EVENT,
  ACCOUNT_DATA_LANDS_EVENT,
  ACCOUNT_KICKED_EVENT,
  ACCOUNT_LOG_EVENT,
  ACCOUNT_STATUS_EVENT,
  ACCOUNT_WS_ERROR_EVENT
} from '../account.events'
import { RunnerDaily } from './runner-daily'
import { RunnerScheduler } from './runner-scheduler'
import { createWorkers } from './worker-factory'

// #region Types

export interface AccountRunnerConfig {
  code: string
  platform: string
  clientConfig?: ClientConfig
  deviceResolution?: ResolvedDeviceConfig
  scheduleOffsetMs?: number
  startJitterMs?: number
}

export type StatusEventName = 'connection' | 'profile' | 'session' | 'operations' | 'schedule'

export interface DailyRoutineRunOptions {
  force?: boolean
  suppressNoopLogs?: boolean
}

export interface AccountRunnerDeps {
  linkClient: LinkClientService
  gameConfig: GameConfigService
  accountConfig: AccountConfigService
  globalConfig: GlobalConfigService
  eventEmitter: EventEmitter2
  deviceFingerprint: DeviceFingerprintService
}

export interface AccountRunnerRuntimeStats {
  connection: ConnectionEventData
  status: ProfileEventData
  operations: OperationsEventData
  limits?: unknown
  sessionExpGained: number
  sessionGoldGained: number
  sessionCouponGained: number
  lastExpGain: number
  lastGoldGain: number
  uptime?: number
}

export interface AccountRunnerStatusSnapshot extends AccountRunnerRuntimeStats {
  bootAt: number
  levelProgress: unknown
  configRevision: number
  device: {
    source: ResolvedDeviceConfig['source']
    selectedKind: ResolvedDeviceConfig['selectedKind']
    selectedProfileId: string | null
    basePresetId: string | null
    usedFallback: boolean
    fallbackFields: string[]
    client: {
      platform?: string
      os?: string
      userAgent?: string
      deviceId?: string
      sysHardware?: string
    }
  } | null
  nextChecks: {
    nextFarmRunAt: number
    nextFriendRunAt: number
  }
}

export interface TaskDailyOverview {
  key: string
  doneToday: boolean
  lastClaimAt: number
  claimableCount: number
  pendingCount: number
  completedCount: number
  totalCount: number
}

export interface GrowthTaskItemOverview {
  id: number
  desc: string
  progress: number
  totalProgress: number
  isClaimed: boolean
  isUnlocked: boolean
  isCompleted: boolean
}

export interface GrowthTaskOverview {
  key: string
  doneToday: boolean
  completedCount: number
  totalCount: number
  tasks: GrowthTaskItemOverview[]
}

export interface DailyRewardCheckState {
  key: string
  doneToday: boolean
  lastCheckAt?: number
  lastClaimAt?: number
}

// #endregion

function formatDeviceSourceLabel(source: ResolvedDeviceConfig['source']): string {
  switch (source) {
    case 'account_profile': return '账号单独指定'
    case 'global_default_profile': return '全局默认设备'
    case 'built_in_default_preset': return '内置默认预设'
    default: return source
  }
}

export class AccountRunner {
  readonly logger: Logger
  readonly scheduler: Scheduler
  readonly scheduleController: RunnerScheduler
  readonly dailyController: RunnerDaily

  private transport: IGameTransport
  private linkEventHandlers: { [E in LinkEventName]?: (data: LinkEventMap[E]) => void } = {}

  // Worker instances (assigned after start)
  stats!: WorkerSet['stats']
  analytics!: WorkerSet['analytics']
  session!: WorkerSet['session']
  friend!: WorkerSet['friend']
  illustrated!: WorkerSet['illustrated']
  task!: WorkerSet['task']
  dailyRewards!: WorkerSet['dailyRewards']
  invite!: WorkerSet['invite']

  // Runtime state
  isRunning = false
  loginReady = false
  name = ''

  private statsInitialized = false
  private inviteProcessed = false
  appliedConfigRevision = 0
  private pendingScheduleOffsetMs = 0
  startConfig: AccountRunnerConfig | null = null
  currentClientConfig: ClientConfig | undefined
  currentDeviceResolution: ResolvedDeviceConfig | undefined

  private userState = {
    gid: 0,
    name: '',
    level: 0,
    gold: 0,
    exp: 0,
    coupon: 0,
    avatarUrl: '',
    openId: '',
    platform: 'qq' as string
  }

  constructor(
    readonly accountId: string,
    private readonly deps: AccountRunnerDeps
  ) {
    this.logger = new Logger(`Runner:${accountId}`)
    this.scheduler = new Scheduler(`runner-${accountId}`, this.logger)
    this.transport = this.deps.linkClient.createTransport(this.accountId, () => this.userState)
    this.scheduleController = new RunnerScheduler(this.scheduler, {
      runFarmTick: () => this.runFarmTick(),
      runFriendTick: () => this.runFriendTick(),
      isReady: () => this.isRunning,
      onScheduleChanged: () => this.emitSchedule()
    })
    this.dailyController = new RunnerDaily(this.scheduler, {
      runDailyRoutines: options => this.runDailyRoutines(options),
      isReady: () => this.isRunning,
      getDateKey: () => getDateKey()
    })
    this.linkEventHandlers = this.buildLinkEventHandlers()
  }

  // #region Public API

  async getLands() {
    await this.ensureReady()
    return this.session.getLandsDetail()
  }

  async getSeeds() {
    await this.ensureReady()
    return this.session.getAvailableSeeds()
  }

  async getBagSeeds() {
    await this.ensureReady()
    return this.session.getBagSeeds()
  }

  async doFarmOp(opType: string) {
    await this.ensureReady()
    const result = await this.session.runFarmOperation(opType)
    await this.afterOperation()
    return result
  }

  async doSingleLandOp(payload: { action: string, landId: number, seedId: number }) {
    await this.ensureReady()
    const result = await this.session.runSingleLandOperation(payload)
    await this.afterOperation()
    return result
  }

  async getFriends() {
    await this.ensureReady()
    return this.friend.getFriendsList()
  }

  async getFriendLands(gid: number) {
    await this.ensureReady()
    return this.friend.getFriendLandsDetail(gid)
  }

  async getAlmanac(refresh = false) {
    await this.ensureReady()
    return this.illustrated.getOverview(refresh)
  }

  async claimAlmanacRewards() {
    await this.ensureReady()
    const result = await this.illustrated.claimRewards()
    this.pushAlmanac(true).catch(() => {})
    await this.afterOperation()
    return result
  }

  async doFriendOp(gid: number, opType: string) {
    await this.ensureReady()
    const result = await this.friend.doFriendOperation(gid, opType)
    this.pushFriends().catch(() => {})
    await this.afterOperation()
    return result
  }

  async getInteractRecords() {
    await this.ensureReady()
    return this.friend.getInteractRecords()
  }

  async getBag() {
    await this.ensureReady()
    return this.session.getBagDetail()
  }

  async sellItem(itemId: number, count: number) {
    await this.ensureReady()
    const result = await this.session.sellItem(itemId, count)
    this.stats.recordOperation('sell', count)
    await this.afterOperation()
    return result
  }

  async buySeed(goodsId: number, count: number, price: number) {
    await this.ensureReady()
    const result = await this.session.buySeed(goodsId, count, price)
    await this.afterOperation()
    return result
  }

  getAnalytics(sortBy: string) {
    return this.analytics.getPlantRankings(sortBy)
  }

  async getDailyGiftOverview() {
    await this.ensureReady()
    return this.buildDailyGiftOverview()
  }

  // #endregion

  // #region Lifecycle

  async start(config: AccountRunnerConfig) {
    if (this.isRunning)
      return

    const deviceResolution = config.deviceResolution
      ?? this.deps.deviceFingerprint.resolveAccountDeviceConfig(
        this.deps.accountConfig.getAccountConfig(this.accountId).deviceProfileId,
        this.deps.globalConfig.getDefaultDeviceProfileId()
      )

    this.isRunning = true
    this.startConfig = { ...config }
    this.pendingScheduleOffsetMs = Math.max(0, Number(config.scheduleOffsetMs) || 0)
    this.currentClientConfig = config.clientConfig ?? deviceResolution.clientConfig
    this.currentDeviceResolution = deviceResolution

    const initialConfigSnapshot = {
      ...this.deps.accountConfig.getConfigSnapshot(this.accountId),
      __revision: Math.max(1, this.appliedConfigRevision || 1)
    }

    this.initializeWorkers(config.platform)
    this.applyConfig(initialConfigSnapshot)

    this.log(
      `启动摘要[设备]: 来源=${formatDeviceSourceLabel(deviceResolution.source)}; 选中=${deviceResolution.selectedProfileId || 'preset:iphone-15-pro-max'}; 基底=${deviceResolution.basePresetId || '-'}; fallback=${deviceResolution.usedFallback ? '有' : '无'}; 字段=${deviceResolution.fallbackFields.length ? deviceResolution.fallbackFields.join('/') : '无'}`,
      'device_resolution'
    )
    this.log('正在连接服务器...', 'connect')

    try {
      if (!this.isRunning)
        return
      await this.ensureConnected(true)
    } catch (error: any) {
      this.warn(`连接失败: ${error?.message || error}`, 'connect')
      throw error
    }
  }

  async stop() {
    if (!this.isRunning)
      return
    this.isRunning = false
    this.loginReady = false
    this.scheduleController.stop()
    this.dailyController.stop()
    this.scheduler.clearAll()
    this.session?.destroy?.()
    this.friend?.destroy?.()
    this.task?.destroy?.()
  }

  isActive() {
    return this.isRunning
  }

  isConnected() {
    return this.loginReady && this.transport.isConnected()
  }

  async ensureReady() {
    if (!this.isRunning)
      throw new Error('账号未运行')
    if (!this.loginReady)
      await this.ensureConnected()
  }

  async ensureConnected(forceReconnect = false) {
    if (!this.isRunning)
      return
    if (this.loginReady && !forceReconnect)
      return
    if (!this.startConfig)
      throw new Error('账号启动参数丢失')

    const userState = await this.resolveUserState(forceReconnect)
    if (!this.isRunning || !userState)
      return
    await this.handleLoginReady(userState)
  }

  handleLinkEvent<E extends LinkEventName>(event: E, data: LinkEventMap[E]) {
    const handler = this.linkEventHandlers[event] as ((payload: LinkEventMap[E]) => void) | undefined
    handler?.(data)
  }

  private async resolveUserState(forceReconnect: boolean): Promise<LinkUserState | undefined> {
    if (!forceReconnect) {
      try {
        const meta = await this.deps.linkClient.getAccountStatus(this.accountId)
        if (meta?.connected && meta.userState) {
          this.log('恢复游戏连接', 'connect')
          return meta.userState
        }
      } catch (error) {
        this.logger.warn(`获取账号 ${this.accountId} 联机状态失败: ${(error as any)?.message || error}`)
      }
    }
    return this.deps.linkClient.connectAccount(
      this.accountId,
      this.startConfig!.code,
      this.startConfig!.platform,
      this.currentClientConfig
    )
  }

  private async handleLoginReady(userState: LinkUserState) {
    const firstLogin = !this.statsInitialized

    await this.session.bootstrap()
    if (!this.isRunning)
      return

    const mergedUserState = {
      ...userState,
      coupon: Math.max(0, this.session.getCouponBalance())
    }
    this.updateLoginState(mergedUserState)
    this.log(`登录成功: ${userState.name || ''} (等级 ${userState.level ?? ''})`, 'login')

    if (firstLogin) {
      this.stats.initStats(
        Number(mergedUserState.gold || 0),
        Number(mergedUserState.exp || 0),
        Number(mergedUserState.coupon || 0)
      )
      this.statsInitialized = true
    }

    if (!this.inviteProcessed) {
      await this.invite.processInviteCodes().catch(error =>
        this.logger.warn(`处理邀请码失败: ${(error as any)?.message}`)
      )
      this.inviteProcessed = true
    }

    if (firstLogin) {
      this.friend.startFriendLoop({ externalScheduler: true })
      this.task.init()
      this.scheduleController.start()

      const scheduleOffset = this.pendingScheduleOffsetMs
      if (scheduleOffset > 0) {
        this.scheduleController.applyOffset(scheduleOffset)
        this.pendingScheduleOffsetMs = 0
      }

      this.dailyController.start()
    }

    this.refreshIdleDisconnectTimer()
    this.emitStatusSnapshot()
  }

  private updateLoginState(userState: LinkUserState) {
    this.userState = { ...this.userState, ...userState }
    this.loginReady = true
    this.name = this.userState.name || this.name
  }

  // #endregion

  // #region Ticks

  private async runFarmTick() {
    if (!await this.prepareAutomationTick())
      return

    try {
      const auto = this.deps.accountConfig.getAutomation(this.accountId)
      if (auto.farm) {
        const result = await this.session.runScheduledAutomationPass()
        if (result)
          await this.afterOperation()
      }
    } catch (error: any) {
      this.warn(`农场调度执行失败: ${error?.message || error}`, 'schedule_error')
    } finally {
      this.syncStatusAfterTick()
    }
  }

  private async runFriendTick() {
    if (!await this.prepareAutomationTick())
      return

    try {
      const auto = this.deps.accountConfig.getAutomation(this.accountId)
      if (auto.friend_steal || auto.friend_help || auto.friend_bad) {
        const result = await this.friend.checkFriends()
        if (result)
          await this.afterOperation()
      }
    } catch (error: any) {
      this.warn(`好友调度执行失败: ${error?.message || error}`, 'schedule_error')
    } finally {
      this.syncStatusAfterTick()
      this.pushFriends().catch(() => {})
    }
  }

  async runDailyRoutines(options: DailyRoutineRunOptions = {}) {
    const { force = false, suppressNoopLogs = false } = options

    await this.ensureConnected()
    if (!this.isRunning || !this.loginReady)
      return

    const auto = this.deps.accountConfig.getAutomation(this.accountId)

    try {
      if (auto.email)
        await this.dailyRewards.checkAndClaimEmails({ force, suppressNoopLogs })
      if (auto.fertilizer_gift)
        await this.session.autoOpenFertilizerGiftPacks()
      if (auto.fertilizer_buy) {
        const cfg = this.deps.accountConfig.getAccountConfig(this.accountId).fertilizerBuy
        await this.dailyRewards.autoBuyFertilizer(cfg as FertilizerBuyConfig)
      }
      if (auto.share_reward)
        await this.dailyRewards.performDailyShare({ force, suppressNoopLogs })
      if (auto.month_card)
        await this.dailyRewards.performDailyMonthCardGift({ force, suppressNoopLogs })
      if (auto.open_server_gift)
        await this.dailyRewards.performDailyOpenServerGift({ force, suppressNoopLogs })
      if (auto.free_gifts)
        await this.dailyRewards.buyFreeGifts({ force, suppressNoopLogs })
      if (auto.vip_gift)
        await this.dailyRewards.performDailyVipGift({ force, suppressNoopLogs })

      const overview = await this.buildDailyGiftOverview().catch(() => null)
      if (overview != null)
        this.emitDataEvent(ACCOUNT_DATA_DAILY_GIFTS_EVENT, overview)
    } catch (error: any) {
      this.warn(`每日任务调度失败: ${error?.message || error}`, 'schedule_error')
    }
  }

  private async prepareAutomationTick() {
    if (!this.isRunning)
      return false
    await this.ensureConnected()
    return this.isRunning && this.loginReady
  }

  // #endregion

  // #region Event Emission

  private emitKicked(reason: string) {
    this.deps.eventEmitter.emit(ACCOUNT_KICKED_EVENT, {
      accountId: this.accountId,
      reason
    })
  }

  private emitWsError(code: number, message: string) {
    this.deps.eventEmitter.emit(ACCOUNT_WS_ERROR_EVENT, {
      accountId: this.accountId,
      code,
      message
    })
  }

  private emitConnection() {
    this.emitStatusEvent('connection', {
      connected: this.isConnected(),
      accountName: this.name
    })
  }

  private emitProfile() {
    this.emitStatusEvent('profile', {
      name: this.userState.name,
      level: this.userState.level || 0,
      gold: this.userState.gold || 0,
      exp: this.userState.exp || 0,
      coupon: this.userState.coupon || 0,
      platform: this.userState.platform || 'qq',
      avatarUrl: this.userState.avatarUrl || '',
      openId: this.userState.openId || ''
    })
  }

  private emitSession() {
    const stats = this.getSessionStats()
    const levelProgress = this.deps.gameConfig.getLevelExpProgress(stats.level || 0, stats.exp || 0)
    this.emitStatusEvent('session', {
      bootAt: stats.bootAt,
      sessionExpGained: stats.sessionExpGained,
      sessionGoldGained: stats.sessionGoldGained,
      sessionCouponGained: stats.sessionCouponGained,
      lastExpGain: stats.lastExpGain,
      lastGoldGain: stats.lastGoldGain,
      levelProgress
    })
  }

  private emitOperations() {
    this.emitStatusEvent('operations', this.getSessionStats().operations as StatusEventData)
  }

  private emitSchedule() {
    const remains = this.scheduleController.getScheduleRemains()
    this.emitStatusEvent('schedule', {
      farmRemainSec: remains.farmRemainSec,
      friendRemainSec: remains.friendRemainSec,
      configRevision: this.appliedConfigRevision
    })
  }

  private emitStatusSnapshot() {
    this.emitConnection()
    this.emitProfile()
    this.emitSession()
    this.emitOperations()
    this.emitSchedule()
  }

  private emitDataEvent(event: string, data: unknown) {
    this.deps.eventEmitter.emit(event, {
      accountId: this.accountId,
      data
    })
  }

  private forwardLog(entry: GameLogEntry) {
    this.deps.eventEmitter.emit(ACCOUNT_LOG_EVENT, {
      accountId: this.accountId,
      accountName: this.name,
      entry
    })
  }

  log(msg: string, event?: string) {
    this.logger.log(msg)
    this.forwardLog({ msg, tag: '系统', meta: { module: 'system', ...(event && { event }) }, isWarn: false })
  }

  warn(msg: string, event?: string) {
    this.logger.warn(msg)
    this.forwardLog({ msg, tag: '系统', meta: { module: 'system', ...(event && { event }) }, isWarn: true })
  }

  private emitStatusEvent(event: StatusEventName, data: StatusEventData) {
    const payload: AccountStatusEventPayload = {
      accountId: this.accountId,
      event,
      data,
      accountName: this.name
    }
    this.deps.eventEmitter.emit(ACCOUNT_STATUS_EVENT, payload)
  }

  // #endregion

  // #region Link Events

  private buildLinkEventHandlers(): { [E in LinkEventName]?: (data: LinkEventMap[E]) => void } {
    return {
      kicked: (data) => {
        const reason = data.reason || '未知'
        this.warn(`被踢下线: ${reason}`, 'kickout')
        this.emitKicked(reason)
      },
      ws_error: (data) => {
        this.emitWsError(data.code, data.message || '')
      },
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
        this.userState = { ...this.userState, ...data }
        this.loginReady = true
        this.name = this.userState.name || this.name
        this.emitStatusSnapshot()
      },
      state_update: (data) => {
        const previous = { ...this.userState }
        const oldLevel = Number(previous.level || 0)
        const merged = { ...previous, ...data }
        if (Number(data.coupon) === 0 && Number(previous.coupon) > 0)
          merged.coupon = previous.coupon
        this.userState = merged

        if (merged.level != null && Number(merged.level) > oldLevel && oldLevel > 0) {
          this.stats.recordOperation('levelUp', 1)
          this.log(`账号升级至 Lv${merged.level}`, 'level_up')
        }

        this.deferStatusFlush(500)
      },
      notify: (data) => {
        const kind = String(data?.kind || '')
        if (kind === 'illustrated_reward' || kind === 'illustrated_change') {
          this.scheduler.setTimeoutTask('almanac_notify_refresh', 300, () =>
            this.pushAlmanac(true))
        }
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

  // #endregion

  // #region State & Config

  applyConfig(snapshot: Partial<AccountConfigSnapshot> & { __revision?: number }) {
    if (!this.session || !this.friend)
      return

    const revision = Number(snapshot?.__revision || 0)
    if (revision > 0)
      this.appliedConfigRevision = revision

    if (snapshot?.intervals)
      this.scheduleController.applyIntervals(snapshot.intervals)

    this.session.onConfigChanged()
    this.friend.refreshFriendLoop(200)
    this.scheduleController.reschedule()

    const pendingOffset = this.pendingScheduleOffsetMs
    if (pendingOffset > 0) {
      this.scheduleController.applyOffset(pendingOffset)
      this.pendingScheduleOffsetMs = 0
    }

    if (snapshot?.automation) {
      const auto = this.deps.accountConfig.getAutomation(this.accountId)
      const cfg = this.deps.accountConfig.getAccountConfig(this.accountId)
      const allDailyOn = auto.email && auto.free_gifts && auto.share_reward && auto.vip_gift && auto.month_card && auto.open_server_gift
      if (allDailyOn)
        this.scheduler.setTimeoutTask('daily_routine_immediate', 400, () => this.runDailyRoutines({ force: false, suppressNoopLogs: true }).catch(() => {}))
      const fert = String(cfg.fertilizer || '').toLowerCase()
      if (fert === 'both' || fert === 'organic') {
        this.scheduler.setTimeoutTask('fertilizer_immediate', 600, async () => {
          if (this.isRunning)
            await this.session.runFarmOperation('all').catch(() => {})
        })
      }
    }

    this.refreshIdleDisconnectTimer()
    this.emitSchedule()
  }

  getStatusSnapshot(): AccountRunnerStatusSnapshot {
    const fullStats = this.getFullStats()
    const levelProgress = this.deps.gameConfig.getLevelExpProgress(this.userState.level || 0, this.userState.exp || 0)
    const { uptime: _ignored, ...rest } = fullStats
    return {
      ...rest,
      bootAt: this.stats.getBootAt(),
      levelProgress,
      configRevision: this.appliedConfigRevision,
      device: this.currentDeviceResolution
        ? {
            source: this.currentDeviceResolution.source,
            selectedKind: this.currentDeviceResolution.selectedKind,
            selectedProfileId: this.currentDeviceResolution.selectedProfileId,
            basePresetId: this.currentDeviceResolution.basePresetId,
            usedFallback: this.currentDeviceResolution.usedFallback,
            fallbackFields: [...this.currentDeviceResolution.fallbackFields],
            client: {
              platform: this.currentClientConfig?.platform,
              os: this.currentClientConfig?.os,
              userAgent: this.currentClientConfig?.userAgent,
              deviceId: this.currentClientConfig?.deviceInfo?.deviceId,
              sysHardware: this.currentClientConfig?.deviceInfo?.sysHardware
            }
          }
        : null,
      nextChecks: {
        nextFarmRunAt: this.scheduleController.nextFarmRunAt,
        nextFriendRunAt: this.scheduleController.nextFriendRunAt
      }
    }
  }

  getStatus(): AccountRunnerRuntimeStats {
    return this.getFullStats()
  }

  // #endregion

  // #region Operations (internal)

  private async buildDailyGiftOverview() {
    const auto = this.deps.accountConfig.getAutomation(this.accountId)
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

  private async pushFriends() {
    try {
      const friends = await this.friend.getFriendsList()
      if (friends != null)
        this.emitDataEvent(ACCOUNT_DATA_FRIENDS_EVENT, friends)
    } catch {}
  }

  private async pushAlmanac(refresh = false) {
    try {
      const overview = await this.illustrated.getOverview(refresh)
      if (overview != null)
        this.emitDataEvent(ACCOUNT_DATA_ALMANAC_EVENT, overview)
    } catch {}
  }

  private async afterOperation() {
    this.refreshIdleDisconnectTimer()
  }

  // #endregion

  // #region Workers (internal)

  private initializeWorkers(platform: string) {
    const workers = createWorkers({
      accountId: this.accountId,
      transport: this.transport,
      gameConfig: this.deps.gameConfig,
      accountConfig: this.deps.accountConfig,
      platform,
      onLog: entry => this.forwardLog(entry),
      onLandsUpdate: data => this.emitDataEvent(ACCOUNT_DATA_LANDS_EVENT, data),
      onBagUpdate: data => this.emitDataEvent(ACCOUNT_DATA_BAG_EVENT, data),
      getSellAllFruits: () => this.session.sellAllFruits(),
      getRawBagItems: () => this.session.getRawBagItems()
    })
    this.stats = workers.stats
    this.analytics = workers.analytics
    this.session = workers.session
    this.friend = workers.friend
    this.illustrated = workers.illustrated
    this.task = workers.task
    this.dailyRewards = workers.dailyRewards
    this.invite = workers.invite
  }

  // #endregion

  // #region Helpers (internal)

  private refreshIdleDisconnectTimer() {
    this.scheduler.clear('idle_disconnect')
  }

  private syncStatusAfterTick() {
    this.scheduler.clear('status_flush')
    this.flushDeferredStatus()
    this.emitSession()
    this.emitOperations()
    this.emitSchedule()
  }

  private deferStatusFlush(delayMs: number) {
    this.scheduler.setTimeoutTask('status_flush', delayMs, () => this.flushDeferredStatus())
  }

  private flushDeferredStatus() {
    this.emitProfile()
    this.emitSession()
  }

  private getSessionStats(): AccountRunnerRuntimeStats & { bootAt: number, level: number, exp: number } {
    const fullStats = this.getFullStats()
    return {
      ...fullStats,
      bootAt: this.stats.getBootAt(),
      level: this.userState.level || 0,
      exp: this.userState.exp || 0
    }
  }

  private getFullStats(): AccountRunnerRuntimeStats {
    const raw = this.stats.getStats(
      this.userState,
      this.isConnected(),
      this.friend?.getOperationLimits?.() || {}
    )
    return {
      ...raw,
      connection: { ...raw.connection, accountName: this.name }
    }
  }

  // #endregion
}
