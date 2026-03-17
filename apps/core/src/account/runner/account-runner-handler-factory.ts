import type { Logger } from '@nestjs/common'
import type { Scheduler } from '@qq-farm/shared'
import type { FertilizerBuyConfig } from '../../game/constants'
import type { LinkEventMap, LinkUserState } from '../../game/types'
import type { IGameTransport } from '../../transport/interfaces/game-transport.interface'
import type { AccountRunnerDeps } from './account-runner'
import type { AccountRunnerRuntimeStats } from './account-runner-state'
import type { DailyRoutineRunOptions } from './account-runner-ticks'
import type { RunnerDaily } from './runner-daily'
import type { RunnerScheduler } from './runner-scheduler'
import type { WorkerSet } from './worker-factory'
import {
  ACCOUNT_DATA_BAG_EVENT,
  ACCOUNT_DATA_DAILY_GIFTS_EVENT,
  ACCOUNT_DATA_LANDS_EVENT
} from '../account.events'
import { AccountRunnerActions } from './account-runner-actions'
import { AccountRunnerConnection } from './account-runner-connection'
import { AccountRunnerEmitter } from './account-runner-emitter'
import { AccountRunnerLifecycle } from './account-runner-lifecycle'
import { AccountRunnerLinkEvents } from './account-runner-link-events'
import { AccountRunnerLoginReady } from './account-runner-login-ready'
import { AccountRunnerOperations } from './account-runner-operations'
import { AccountRunnerStarter } from './account-runner-starter'
import { AccountRunnerState } from './account-runner-state'
import { AccountRunnerTicks } from './account-runner-ticks'
import { AccountRunnerWorkers } from './account-runner-workers'

export interface AccountRunnerHandlerFactoryDeps {
  accountId: string
  deps: AccountRunnerDeps
  logger: Logger
  scheduler: Scheduler
  transport: IGameTransport
  scheduleController: RunnerScheduler
  dailyController: RunnerDaily
  getName: () => string
  getIsConnected: () => boolean
  getUserState: () => {
    name: string
    level: number
    gold: number
    exp: number
    coupon: number
    avatarUrl: string
    openId: string
    platform: string
  }
  getSessionStats: () => AccountRunnerRuntimeStats & {
    bootAt: number
    level: number
    exp: number
  }
  getSchedulePayload: () => {
    farmRemainSec: number
    friendRemainSec: number
    configRevision: number
  }
  ensureReady: () => Promise<void>
  getWorkers: () => {
    session: WorkerSet['session']
    friend: WorkerSet['friend']
    illustrated: WorkerSet['illustrated']
    task: WorkerSet['task']
    dailyRewards: WorkerSet['dailyRewards']
    invite: WorkerSet['invite']
    stats: WorkerSet['stats']
    analytics: WorkerSet['analytics']
  }
  getFlags: () => {
    isRunning: boolean
    loginReady: boolean
    statsInitialized: boolean
    inviteProcessed: boolean
    appliedConfigRevision: number
    pendingScheduleOffsetMs: number
    currentClientConfig?: {
      platform?: string
      os?: string
      userAgent?: string
      deviceInfo?: {
        deviceId?: string
        sysHardware?: string
      }
    }
    currentDeviceResolution?: import('../../device/device-fingerprint').ResolvedDeviceConfig
  }
  setLoginReady: (value: boolean) => void
  setStatsInitialized: (value: boolean) => void
  setInviteProcessed: (value: boolean) => void
  setAppliedConfigRevision: (value: number) => void
  setPendingScheduleOffsetMs: (value: number) => void
  onLogin: (userState: LinkUserState) => void
  onLog: (msg: string, event?: string) => void
  onWarn: (msg: string, event?: string) => void
  emitDataEvent: (event: string, data: unknown) => void
  afterOperation: () => Promise<void>
  pushFriends: () => Promise<void>
  pushAlmanac: (refresh?: boolean) => Promise<void>
  refreshIdleDisconnectTimer: () => void
  ensureConnected: (forceReconnect?: boolean) => Promise<void>
  disconnectForIdle: () => Promise<void>
  runDailyRoutines: (options?: DailyRoutineRunOptions) => Promise<void>
  onKickout: (payload: LinkEventMap['kicked']) => void
  onWsError: (payload: LinkEventMap['ws_error']) => void
}

export function createAccountRunnerHandlers(factoryDeps: AccountRunnerHandlerFactoryDeps) {
  const emitter = new AccountRunnerEmitter({
    accountId: factoryDeps.accountId,
    eventEmitter: factoryDeps.deps.eventEmitter,
    logger: factoryDeps.logger,
    gameConfig: factoryDeps.deps.gameConfig,
    getAccountName: factoryDeps.getName,
    isConnected: factoryDeps.getIsConnected,
    getUserState: factoryDeps.getUserState,
    getSessionStats: factoryDeps.getSessionStats,
    getSchedulePayload: factoryDeps.getSchedulePayload
  })

  const actionsHandler = new AccountRunnerActions({
    ensureReady: factoryDeps.ensureReady,
    getLands: () => factoryDeps.getWorkers().session.getLandsDetail(),
    getSeeds: () => factoryDeps.getWorkers().session.getAvailableSeeds(),
    getBagSeeds: () => factoryDeps.getWorkers().session.getBagSeeds(),
    doFarmOp: opType => factoryDeps.getWorkers().session.runFarmOperation(opType),
    doSingleLandOp: payload => factoryDeps.getWorkers().session.runSingleLandOperation(payload),
    getFriends: () => factoryDeps.getWorkers().friend.getFriendsList(),
    getFriendLands: gid => factoryDeps.getWorkers().friend.getFriendLandsDetail(gid),
    getAlmanac: refresh => factoryDeps.getWorkers().illustrated.getOverview(refresh),
    claimAlmanacRewards: () => factoryDeps.getWorkers().illustrated.claimRewards(),
    doFriendOp: (gid, opType) => factoryDeps.getWorkers().friend.doFriendOperation(gid, opType),
    getInteractRecords: () => factoryDeps.getWorkers().friend.getInteractRecords(),
    getBag: () => factoryDeps.getWorkers().session.getBagDetail(),
    sellItem: (itemId, count) => factoryDeps.getWorkers().session.sellItem(itemId, count),
    buySeed: (goodsId, count, price) => factoryDeps.getWorkers().session.buySeed(goodsId, count, price),
    getAnalytics: sortBy => factoryDeps.getWorkers().analytics.getPlantRankings(sortBy),
    recordSell: count => factoryDeps.getWorkers().stats.recordOperation('sell', count),
    afterOperation: factoryDeps.afterOperation,
    pushFriends: factoryDeps.pushFriends,
    pushAlmanac: factoryDeps.pushAlmanac
  })

  const connectionHandler = new AccountRunnerConnection({
    accountId: factoryDeps.accountId,
    linkClient: factoryDeps.deps.linkClient,
    logRestore: () => factoryDeps.onLog('恢复游戏连接', 'connect'),
    logStatusError: error => factoryDeps.logger.warn(`获取账号 ${factoryDeps.accountId} 联机状态失败: ${(error as any)?.message || error}`)
  })

  const lifecycleHandler = new AccountRunnerLifecycle({
    accountId: factoryDeps.accountId,
    scheduler: factoryDeps.scheduler,
    runtimePolicy: factoryDeps.deps.runtimePolicy,
    linkClient: factoryDeps.deps.linkClient,
    getIsRunning: () => factoryDeps.getFlags().isRunning,
    getLoginReady: () => factoryDeps.getFlags().loginReady,
    setLoginReady: factoryDeps.setLoginReady,
    emitConnection: () => emitter.emitConnection(),
    emitProfile: () => emitter.emitProfile(),
    emitSession: () => emitter.emitSession(),
    emitOperations: () => emitter.emitOperations(),
    emitSchedule: () => emitter.emitSchedule(),
    stopScheduleController: () => factoryDeps.scheduleController.stop(),
    stopDailyController: () => factoryDeps.dailyController.stop(),
    clearAllSchedulerTasks: () => factoryDeps.scheduler.clearAll()
  })

  const loginReadyHandler = new AccountRunnerLoginReady({
    accountId: factoryDeps.accountId,
    transport: factoryDeps.transport,
    runtimePolicy: factoryDeps.deps.runtimePolicy,
    sessionBootstrap: factoryDeps.deps.sessionBootstrap,
    scheduler: factoryDeps.scheduleController,
    daily: factoryDeps.dailyController,
    getIsRunning: () => factoryDeps.getFlags().isRunning,
    onLogin: factoryDeps.onLogin,
    bootstrapSession: () => factoryDeps.getWorkers().session.bootstrap(),
    getCouponBalance: () => factoryDeps.getWorkers().session.getCouponBalance(),
    initStats: (gold, exp, coupon) => factoryDeps.getWorkers().stats.initStats(gold, exp, coupon),
    getStatsInitialized: () => factoryDeps.getFlags().statsInitialized,
    setStatsInitialized: factoryDeps.setStatsInitialized,
    processInviteCodes: () => factoryDeps.getWorkers().invite.processInviteCodes(),
    getInviteProcessed: () => factoryDeps.getFlags().inviteProcessed,
    setInviteProcessed: factoryDeps.setInviteProcessed,
    startFriendLoop: () => factoryDeps.getWorkers().friend.startFriendLoop({ externalScheduler: true }),
    initTask: () => factoryDeps.getWorkers().task.init(),
    getPendingScheduleOffsetMs: () => factoryDeps.getFlags().pendingScheduleOffsetMs,
    setPendingScheduleOffsetMs: factoryDeps.setPendingScheduleOffsetMs,
    applyScheduleOffset: value => factoryDeps.scheduleController.applyOffset(value),
    refreshIdleDisconnectTimer: factoryDeps.refreshIdleDisconnectTimer,
    syncStatusAtomic: () => emitter.emitStatusSnapshot(),
    logInviteFailure: error => factoryDeps.logger.warn(`处理邀请码失败: ${(error as any)?.message}`)
  })

  const operationsHandler = new AccountRunnerOperations({
    accountId: factoryDeps.accountId,
    store: factoryDeps.deps.store,
    transport: factoryDeps.transport,
    backgroundRequest: factoryDeps.deps.backgroundRequest,
    runtimePolicy: factoryDeps.deps.runtimePolicy,
    getTaskDailyState: () => factoryDeps.getWorkers().task.getTaskDailyStateLikeApp(),
    getGrowthTaskState: () => factoryDeps.getWorkers().task.getGrowthTaskStateLikeApp(),
    getEmailDailyState: () => factoryDeps.getWorkers().dailyRewards.getEmailDailyState(),
    getFreeGiftDailyState: () => factoryDeps.getWorkers().dailyRewards.getFreeGiftDailyState(),
    getShareDailyState: () => factoryDeps.getWorkers().dailyRewards.getShareDailyState(),
    getVipDailyState: () => factoryDeps.getWorkers().dailyRewards.getVipDailyState(),
    getMonthCardDailyState: () => factoryDeps.getWorkers().dailyRewards.getMonthCardDailyState(),
    getOpenServerDailyState: () => factoryDeps.getWorkers().dailyRewards.getOpenServerDailyState(),
    getFriends: () => factoryDeps.getWorkers().friend.getFriendsList(),
    getAlmanac: refresh => factoryDeps.getWorkers().illustrated.getOverview(refresh),
    emitDataEvent: factoryDeps.emitDataEvent,
    refreshIdleDisconnectTimer: factoryDeps.refreshIdleDisconnectTimer
  })

  const stateHandler = new AccountRunnerState({
    accountId: factoryDeps.accountId,
    scheduler: factoryDeps.scheduler,
    scheduleController: factoryDeps.scheduleController,
    store: factoryDeps.deps.store,
    gameConfig: factoryDeps.deps.gameConfig,
    getAppliedConfigRevision: () => factoryDeps.getFlags().appliedConfigRevision,
    setAppliedConfigRevision: factoryDeps.setAppliedConfigRevision,
    getPendingScheduleOffsetMs: () => factoryDeps.getFlags().pendingScheduleOffsetMs,
    setPendingScheduleOffsetMs: factoryDeps.setPendingScheduleOffsetMs,
    getIsRunning: () => factoryDeps.getFlags().isRunning,
    onSessionConfigChanged: () => factoryDeps.getWorkers().session.onConfigChanged(),
    refreshFriendLoop: delayMs => factoryDeps.getWorkers().friend.refreshFriendLoop(delayMs),
    runDailyRoutines: options => factoryDeps.runDailyRoutines(options),
    runFarmOperation: opType => factoryDeps.getWorkers().session.runFarmOperation(opType),
    refreshIdleDisconnectTimer: factoryDeps.refreshIdleDisconnectTimer,
    emitSchedule: () => emitter.emitSchedule(),
    getStatusStats: factoryDeps.getSessionStats,
    getBootAt: () => factoryDeps.getWorkers().stats.getBootAt(),
    getUserState: () => {
      const userState = factoryDeps.getUserState()
      return { level: userState.level || 0, exp: userState.exp || 0 }
    },
    getCurrentClientConfig: () => factoryDeps.getFlags().currentClientConfig,
    getCurrentDeviceResolution: () => factoryDeps.getFlags().currentDeviceResolution,
    getNextChecks: () => ({
      nextFarmRunAt: factoryDeps.scheduleController.nextFarmRunAt,
      nextFriendRunAt: factoryDeps.scheduleController.nextFriendRunAt
    })
  })

  const starterHandler = new AccountRunnerStarter({
    accountId: factoryDeps.accountId,
    store: factoryDeps.deps.store,
    runtimePolicy: factoryDeps.deps.runtimePolicy,
    deviceFingerprint: factoryDeps.deps.deviceFingerprint,
    getAppliedConfigRevision: () => factoryDeps.getFlags().appliedConfigRevision
  })

  const ticksHandler = new AccountRunnerTicks({
    accountId: factoryDeps.accountId,
    store: factoryDeps.deps.store,
    activeHours: factoryDeps.deps.activeHours,
    getIsRunning: () => factoryDeps.getFlags().isRunning,
    getLoginReady: () => factoryDeps.getFlags().loginReady,
    ensureConnected: () => factoryDeps.ensureConnected(),
    disconnectForIdle: factoryDeps.disconnectForIdle,
    runScheduledAutomationPass: () => factoryDeps.getWorkers().session.runScheduledAutomationPass(),
    checkFriends: () => factoryDeps.getWorkers().friend.checkFriends(),
    afterOperation: factoryDeps.afterOperation,
    syncStatusAfterTick: () => lifecycleHandler.syncStatusAfterTick(),
    pushFriends: factoryDeps.pushFriends,
    getDailyGiftOverview: () => operationsHandler.getDailyGiftOverview(),
    emitDailyGiftOverview: overview => factoryDeps.emitDataEvent(ACCOUNT_DATA_DAILY_GIFTS_EVENT, overview),
    autoOpenFertilizerGiftPacks: () => factoryDeps.getWorkers().session.autoOpenFertilizerGiftPacks(),
    autoBuyFertilizer: cfg => factoryDeps.getWorkers().dailyRewards.autoBuyFertilizer(cfg as FertilizerBuyConfig),
    checkAndClaimEmails: options => factoryDeps.getWorkers().dailyRewards.checkAndClaimEmails(options),
    performDailyShare: options => factoryDeps.getWorkers().dailyRewards.performDailyShare(options),
    performDailyMonthCardGift: options => factoryDeps.getWorkers().dailyRewards.performDailyMonthCardGift(options),
    performDailyOpenServerGift: options => factoryDeps.getWorkers().dailyRewards.performDailyOpenServerGift(options),
    buyFreeGifts: options => factoryDeps.getWorkers().dailyRewards.buyFreeGifts(options),
    performDailyVipGift: options => factoryDeps.getWorkers().dailyRewards.performDailyVipGift(options),
    warn: factoryDeps.onWarn
  })

  const workersHandler = new AccountRunnerWorkers({
    accountId: factoryDeps.accountId,
    transport: factoryDeps.transport,
    gameConfig: factoryDeps.deps.gameConfig,
    store: factoryDeps.deps.store,
    rhythm: factoryDeps.deps.rhythm,
    onLog: entry => emitter.forwardLog(entry),
    onLandsUpdate: data => factoryDeps.emitDataEvent(ACCOUNT_DATA_LANDS_EVENT, data),
    onBagUpdate: data => factoryDeps.emitDataEvent(ACCOUNT_DATA_BAG_EVENT, data),
    getSellAllFruits: () => factoryDeps.getWorkers().session.sellAllFruits(),
    getRawBagItems: () => factoryDeps.getWorkers().session.getRawBagItems()
  })

  const linkEventHandlers = new AccountRunnerLinkEvents({
    transport: factoryDeps.transport,
    getLoginReady: () => factoryDeps.getFlags().loginReady,
    setLoginReady: factoryDeps.setLoginReady,
    getUserState: factoryDeps.getUserState,
    setUserState: factoryDeps.onLogin,
    recordLevelUp: () => factoryDeps.getWorkers().stats.recordOperation('levelUp', 1),
    log: factoryDeps.onLog,
    warn: factoryDeps.onWarn,
    emitConnection: () => emitter.emitConnection(),
    syncStatusAtomic: () => emitter.emitStatusSnapshot(),
    deferStatusFlush: () => lifecycleHandler.deferStatusFlush(500),
    pushAlmanac: factoryDeps.pushAlmanac,
    scheduleTask: (name, delay, task) => factoryDeps.scheduler.setTimeoutTask(name, delay, task),
    handleNotify: data => factoryDeps.getWorkers().session?.handleNotify(data),
    handleServerTime: ms => factoryDeps.getWorkers().session?.handleServerTime(ms),
    emitKicked: factoryDeps.onKickout,
    emitWsError: factoryDeps.onWsError
  }).build()

  return {
    emitter,
    actionsHandler,
    connectionHandler,
    lifecycleHandler,
    loginReadyHandler,
    operationsHandler,
    stateHandler,
    starterHandler,
    ticksHandler,
    workersHandler,
    linkEventHandlers
  }
}
