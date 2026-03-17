import type { ClientConfig } from '@qq-farm/shared/node'
import type { DeviceFingerprintService, ResolvedDeviceConfig } from '../../device/device-fingerprint'
import type { AccountConfigSnapshot } from '../../game/constants'
import type { GameConfigService } from '../../game/game-config.service'
import type { LinkEventMap, LinkEventName } from '../../game/types'
import type { StoreService } from '../../store/store.service'
import type { IGameTransport } from '../../transport/interfaces/game-transport.interface'
import type { LinkClientService } from '../../transport/link-client.service'
import type { AccountRunnerSetupTarget } from './account-runner-setup'
import type { WorkerSet } from './worker-factory'
import { Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Scheduler } from '@qq-farm/shared'
import { getDateKey } from '../../game/utils'
import {
  ACCOUNT_DATA_ALMANAC_EVENT,
  ACCOUNT_DATA_FRIENDS_EVENT
} from '../account.events'
import { AccountRunnerActions } from './account-runner-actions'
import { AccountRunnerConnection } from './account-runner-connection'
import { AccountRunnerEmitter } from './account-runner-emitter'
import { AccountRunnerLifecycle } from './account-runner-lifecycle'
import { AccountRunnerLoginReady } from './account-runner-login-ready'
import { AccountRunnerOperations } from './account-runner-operations'
import { AccountRunnerRuntime } from './account-runner-runtime'
import { setupAccountRunner } from './account-runner-setup'
import { AccountRunnerStarter } from './account-runner-starter'
import { AccountRunnerState } from './account-runner-state'
import { AccountRunnerTicks } from './account-runner-ticks'
import { AccountRunnerWorkers } from './account-runner-workers'
import { RunnerDaily } from './runner-daily'
import { RunnerScheduler } from './runner-scheduler'

export interface AccountRunnerConfig {
  code: string
  platform: string
  clientConfig?: ClientConfig
  deviceResolution?: ResolvedDeviceConfig
  scheduleOffsetMs?: number
  startJitterMs?: number
}

export type StatusEventName = 'connection' | 'profile' | 'session' | 'operations' | 'schedule'

export interface AccountRunnerDeps {
  linkClient: LinkClientService
  gameConfig: GameConfigService
  store: StoreService
  eventEmitter: EventEmitter2
  deviceFingerprint: DeviceFingerprintService
}

export class AccountRunner {
  readonly logger: Logger
  readonly scheduler: Scheduler
  readonly scheduleController: RunnerScheduler
  readonly dailyController: RunnerDaily
  readonly emitter: AccountRunnerEmitter
  readonly actionsHandler: AccountRunnerActions
  readonly connectionHandler: AccountRunnerConnection
  readonly lifecycleHandler: AccountRunnerLifecycle
  readonly loginReadyHandler: AccountRunnerLoginReady
  readonly operationsHandler: AccountRunnerOperations
  readonly runtimeHandler: AccountRunnerRuntime
  readonly stateHandler: AccountRunnerState
  readonly starterHandler: AccountRunnerStarter
  readonly ticksHandler: AccountRunnerTicks
  readonly workersHandler: AccountRunnerWorkers

  private transport!: IGameTransport

  // Runtime wiring surface shared with setup/runtime helpers.
  stats!: WorkerSet['stats']
  analytics!: WorkerSet['analytics']
  session!: WorkerSet['session']
  friend!: WorkerSet['friend']
  illustrated!: WorkerSet['illustrated']
  task!: WorkerSet['task']
  dailyRewards!: WorkerSet['dailyRewards']
  invite!: WorkerSet['invite']

  isRunning = false
  loginReady = false
  statsInitialized = false
  inviteProcessed = false
  appliedConfigRevision = 0
  pendingScheduleOffsetMs = 0
  startConfig: AccountRunnerConfig | null = null
  currentClientConfig: ClientConfig | undefined
  currentDeviceResolution: ResolvedDeviceConfig | undefined

  private linkEventHandlers: { [E in LinkEventName]?: (data: LinkEventMap[E]) => void } = {}

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

  name = ''

  constructor(
    readonly accountId: string,
    private readonly deps: AccountRunnerDeps
  ) {
    const applyConfig = (snapshot: Partial<AccountConfigSnapshot> & { __revision?: number }) => {
      AccountRunner.prototype.applyConfig.call(this, snapshot)
    }

    this.logger = new Logger(`Runner:${accountId}`)
    this.scheduler = new Scheduler(`runner-${accountId}`, this.logger)
    this.transport = this.deps.linkClient.createTransport(this.accountId, () => this.userState)
    this.scheduleController = new RunnerScheduler(this.scheduler, {
      runFarmTick: () => this.ticksHandler.runFarmTick(),
      runFriendTick: () => this.ticksHandler.runFriendTick(),
      isReady: () => this.isRunning,
      onScheduleChanged: () => this.emitter.emitSchedule()
    })
    this.dailyController = new RunnerDaily(this.scheduler, {
      runDailyRoutines: force => this.ticksHandler.runDailyRoutines(force),
      isReady: () => this.isRunning,
      getDateKey: () => getDateKey()
    })
    setupAccountRunner(Object.assign(this as unknown as AccountRunnerSetupTarget, {
      afterOperation: () => this.operationsHandler.afterOperation(),
      applyConfig,
      disconnectForIdle: () => this.lifecycleHandler.disconnectForIdle(),
      emitDataEvent: (event: string, data: unknown) => this.emitter.emitData(event, data),
      log: (msg: string, event?: string) => this.emitter.log(msg, event),
      onKickout: (payload: LinkEventMap['kicked']) => {
        this.runtimeHandler.onKickout(payload)
        this.emitter.emitKicked(payload.reason || '未知')
      },
      onWsError: (payload: LinkEventMap['ws_error']) => {
        this.emitter.emitWsError(payload.code, payload.message || '')
      },
      pushAlmanac: (refresh = false) => this.operationsHandler.pushAlmanac(ACCOUNT_DATA_ALMANAC_EVENT, refresh),
      pushFriends: () => this.operationsHandler.pushFriends(ACCOUNT_DATA_FRIENDS_EVENT),
      refreshIdleDisconnectTimer: () => this.lifecycleHandler.refreshIdleDisconnectTimer(),
      ensureConnected: (forceReconnect?: boolean) => this.runtimeHandler.ensureConnected(forceReconnect),
      ensureReady: () => this.runtimeHandler.ensureReady(),
      initializeWorkers: (platform: string) => {
        this.workersHandler.assign(this as unknown as {
          stats: WorkerSet['stats']
          analytics: WorkerSet['analytics']
          session: WorkerSet['session']
          friend: WorkerSet['friend']
          illustrated: WorkerSet['illustrated']
          task: WorkerSet['task']
          dailyRewards: WorkerSet['dailyRewards']
          invite: WorkerSet['invite']
        }, this.workersHandler.create(platform))
      },
      runDailyRoutines: options => this.ticksHandler.runDailyRoutines(options),
      warn: (msg: string, event?: string) => this.emitter.warn(msg, event)
    }))
  }

  async start(config: AccountRunnerConfig) {
    await this.runtimeHandler.start(config)
  }

  async stop() {
    await this.runtimeHandler.stop()
  }

  isActive() {
    return this.isRunning
  }

  isConnected() {
    return this.loginReady && this.transport.isConnected()
  }

  handleLinkEvent<E extends LinkEventName>(event: E, data: LinkEventMap[E]) {
    const handler = this.linkEventHandlers[event] as ((payload: LinkEventMap[E]) => void) | undefined
    handler?.(data)
  }

  applyConfig(snapshot: Partial<AccountConfigSnapshot> & { __revision?: number }) {
    if (!this.session || !this.friend)
      return
    this.stateHandler.applyConfig(snapshot)
  }

  getStatusSnapshot() {
    return this.stateHandler.getStatusSnapshot()
  }

  getStatus() {
    return this.stateHandler.getStatus()
  }

  async getLands() {
    return this.actionsHandler.getLands()
  }

  async getSeeds() {
    return this.actionsHandler.getSeeds()
  }

  async getBagSeeds() {
    return this.actionsHandler.getBagSeeds()
  }

  async doFarmOp(opType: string) {
    return this.actionsHandler.doFarmOp(opType)
  }

  async doSingleLandOp(payload: { action: string, landId: number, seedId: number }) {
    return this.actionsHandler.doSingleLandOp(payload)
  }

  async getFriends() {
    return this.actionsHandler.getFriends()
  }

  async getFriendLands(gid: number) {
    return this.actionsHandler.getFriendLands(gid)
  }

  async getAlmanac(refresh = false) {
    return this.actionsHandler.getAlmanac(refresh)
  }

  async claimAlmanacRewards() {
    return this.actionsHandler.claimAlmanacRewards()
  }

  async doFriendOp(gid: number, opType: string) {
    return this.actionsHandler.doFriendOp(gid, opType)
  }

  async getInteractRecords() {
    return this.actionsHandler.getInteractRecords()
  }

  async getBag() {
    return this.actionsHandler.getBag()
  }

  async sellItem(itemId: number, count: number) {
    return this.actionsHandler.sellItem(itemId, count)
  }

  async buySeed(goodsId: number, count: number, price: number) {
    return this.actionsHandler.buySeed(goodsId, count, price)
  }

  getAnalytics(sortBy: string) {
    return this.actionsHandler.getAnalytics(sortBy)
  }

  async getDailyGiftOverview() {
    await this.runtimeHandler.ensureReady()
    return this.operationsHandler.getDailyGiftOverview()
  }
}
