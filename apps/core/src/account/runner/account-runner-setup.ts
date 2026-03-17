import type { Logger } from '@nestjs/common'
import type { Scheduler } from '@qq-farm/shared'
import type { ClientConfig } from '@qq-farm/shared/node'
import type { ResolvedDeviceConfig } from '../../device/device-fingerprint'
import type { IGameTransport } from '../../transport/interfaces/game-transport.interface'
import type { AccountRunnerDeps } from './account-runner'
import type { AccountRunnerRuntimeStats } from './account-runner-state'
import type { DailyRoutineRunOptions } from './account-runner-ticks'
import type { RunnerDaily } from './runner-daily'
import type { RunnerScheduler } from './runner-scheduler'
import { createAccountRunnerHandlers } from './account-runner-handler-factory'
import { AccountRunnerRuntime } from './account-runner-runtime'

export interface AccountRunnerSetupTarget {
  accountId: string
  deps: AccountRunnerDeps
  logger: Logger
  scheduler: Scheduler
  transport: IGameTransport
  scheduleController: RunnerScheduler
  dailyController: RunnerDaily
  name: string
  isRunning: boolean
  loginReady: boolean
  statsInitialized: boolean
  inviteProcessed: boolean
  appliedConfigRevision: number
  pendingScheduleOffsetMs: number
  startConfig: any
  currentClientConfig: ClientConfig | undefined
  currentDeviceResolution: ResolvedDeviceConfig | undefined
  userState: {
    name: string
    level: number
    gold: number
    exp: number
    coupon: number
    avatarUrl: string
    openId: string
    platform: string
  }
  session: any
  friend: any
  illustrated: any
  task: any
  dailyRewards: any
  invite: any
  stats: any
  analytics: any
  emitter: any
  actionsHandler: any
  connectionHandler: any
  lifecycleHandler: any
  loginReadyHandler: any
  operationsHandler: any
  stateHandler: any
  starterHandler: any
  ticksHandler: any
  workersHandler: any
  linkEventHandlers: any
  runtimeHandler: any
  isConnected: () => boolean
  ensureReady: () => Promise<void>
  emitDataEvent: (event: string, data: unknown) => void
  afterOperation: () => Promise<void>
  pushFriends: () => Promise<void>
  pushAlmanac: (refresh?: boolean) => Promise<void>
  refreshIdleDisconnectTimer: () => void
  ensureConnected: (forceReconnect?: boolean) => Promise<void>
  disconnectForIdle: () => Promise<void>
  runDailyRoutines: (options?: DailyRoutineRunOptions) => Promise<void>
  onKickout: (payload: any) => void
  onWsError: (payload: any) => void
  initializeWorkers: (platform: string) => void
  applyConfig: (snapshot: any) => void
  log: (msg: string, event?: string) => void
  warn: (msg: string, event?: string) => void
}

export function setupAccountRunner(target: AccountRunnerSetupTarget) {
  const handlers = createAccountRunnerHandlers({
    accountId: target.accountId,
    deps: target.deps,
    logger: target.logger,
    scheduler: target.scheduler,
    transport: target.transport,
    scheduleController: target.scheduleController,
    dailyController: target.dailyController,
    getName: () => target.name,
    getIsConnected: () => target.isConnected(),
    getUserState: () => ({ ...target.userState }),
    getSessionStats: (): AccountRunnerRuntimeStats & { bootAt: number, level: number, exp: number } => {
      const fullStats = target.stats.getStats(target.userState, target.isConnected(), target.friend?.getOperationLimits?.() || {})
      return {
        connection: fullStats.connection,
        status: fullStats.status,
        bootAt: target.stats.getBootAt(),
        operations: fullStats.operations,
        sessionExpGained: fullStats.sessionExpGained,
        sessionGoldGained: fullStats.sessionGoldGained,
        sessionCouponGained: fullStats.sessionCouponGained,
        lastExpGain: fullStats.lastExpGain,
        lastGoldGain: fullStats.lastGoldGain,
        limits: fullStats.limits,
        level: target.userState.level || 0,
        exp: target.userState.exp || 0
      }
    },
    getSchedulePayload: () => {
      const remains = target.scheduleController.getScheduleRemains()
      return {
        farmRemainSec: remains.farmRemainSec,
        friendRemainSec: remains.friendRemainSec,
        configRevision: target.appliedConfigRevision
      }
    },
    ensureReady: () => target.ensureReady(),
    getWorkers: () => ({
      session: target.session,
      friend: target.friend,
      illustrated: target.illustrated,
      task: target.task,
      dailyRewards: target.dailyRewards,
      invite: target.invite,
      stats: target.stats,
      analytics: target.analytics
    }),
    getFlags: () => ({
      isRunning: target.isRunning,
      loginReady: target.loginReady,
      statsInitialized: target.statsInitialized,
      inviteProcessed: target.inviteProcessed,
      appliedConfigRevision: target.appliedConfigRevision,
      pendingScheduleOffsetMs: target.pendingScheduleOffsetMs,
      currentClientConfig: target.currentClientConfig,
      currentDeviceResolution: target.currentDeviceResolution
    }),
    setLoginReady: (value) => { target.loginReady = value },
    setStatsInitialized: (value) => { target.statsInitialized = value },
    setInviteProcessed: (value) => { target.inviteProcessed = value },
    setAppliedConfigRevision: (value) => { target.appliedConfigRevision = value },
    setPendingScheduleOffsetMs: (value) => { target.pendingScheduleOffsetMs = value },
    onLogin: (userState) => {
      target.userState = { ...target.userState, ...userState }
      target.loginReady = true
      target.name = target.userState.name || target.name
    },
    onLog: (msg, event) => target.log(msg, event),
    onWarn: (msg, event) => target.warn(msg, event),
    emitDataEvent: (event, data) => target.emitDataEvent(event, data),
    afterOperation: () => target.afterOperation(),
    pushFriends: () => target.pushFriends(),
    pushAlmanac: refresh => target.pushAlmanac(refresh),
    refreshIdleDisconnectTimer: () => target.refreshIdleDisconnectTimer(),
    ensureConnected: forceReconnect => target.ensureConnected(forceReconnect),
    disconnectForIdle: () => target.disconnectForIdle(),
    runDailyRoutines: options => target.runDailyRoutines(options),
    onKickout: payload => target.onKickout(payload),
    onWsError: payload => target.onWsError(payload)
  })

  target.emitter = handlers.emitter
  target.actionsHandler = handlers.actionsHandler
  target.connectionHandler = handlers.connectionHandler
  target.lifecycleHandler = handlers.lifecycleHandler
  target.loginReadyHandler = handlers.loginReadyHandler
  target.operationsHandler = handlers.operationsHandler
  target.stateHandler = handlers.stateHandler
  target.starterHandler = handlers.starterHandler
  target.ticksHandler = handlers.ticksHandler
  target.workersHandler = handlers.workersHandler
  target.linkEventHandlers = handlers.linkEventHandlers
  target.runtimeHandler = new AccountRunnerRuntime({
    state: {
      get isRunning() {
        return target.isRunning
      },
      set isRunning(value) {
        target.isRunning = value
      },
      get loginReady() {
        return target.loginReady
      },
      set loginReady(value) {
        target.loginReady = value
      },
      get startConfig() {
        return target.startConfig
      },
      set startConfig(value) {
        target.startConfig = value
      },
      get pendingScheduleOffsetMs() {
        return target.pendingScheduleOffsetMs
      },
      set pendingScheduleOffsetMs(value) {
        target.pendingScheduleOffsetMs = value
      },
      get currentClientConfig() {
        return target.currentClientConfig
      },
      set currentClientConfig(value) {
        target.currentClientConfig = value
      },
      get currentDeviceResolution() {
        return target.currentDeviceResolution
      },
      set currentDeviceResolution(value) {
        target.currentDeviceResolution = value
      }
    },
    starterHandler: target.starterHandler,
    lifecycleHandler: target.lifecycleHandler,
    connectionHandler: target.connectionHandler,
    loginReadyHandler: target.loginReadyHandler,
    workersHandler: target.workersHandler,
    initializeWorkers: platform => target.initializeWorkers(platform),
    applyInitialConfig: snapshot => target.applyConfig(snapshot),
    updateLoginState: (userState) => {
      target.userState = { ...target.userState, ...userState }
      target.loginReady = true
      target.name = target.userState.name || target.name
    },
    log: (msg, event) => target.log(msg, event),
    warn: (msg, event) => target.warn(msg, event),
    getDestroyableWorkers: () => ({
      session: target.session,
      friend: target.friend,
      task: target.task
    })
  })
}
