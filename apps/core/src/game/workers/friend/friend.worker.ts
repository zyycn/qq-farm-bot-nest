import type { StoreService } from '../../../store/store.service'
import type { GameConfigService } from '../../game-config.service'
import type { IGameTransport } from '../../interfaces/game-transport.interface'
import type { StatsTracker } from '../stats.worker'
import type { FriendLandAnalysis } from './friend-land-analysis'
import { Logger } from '@nestjs/common'
import { Scheduler } from '@qq-farm/shared'
import { OP_TYPE_NAMES } from '../../constants'
import { FriendApplicationsHandler } from './friend-applications'
import { FriendCycleHandler } from './friend-cycle'
import { FriendHelpHandler } from './friend-help'
import { FriendInteractHandler } from './friend-interact'
import { FriendLandAnalyzer } from './friend-land-analysis'
import { FriendLoopHandler } from './friend-loop'
import { FriendOperationLimits } from './friend-operation-limits'
import { FriendPublicApi } from './friend-public-api'
import { FriendServiceClient } from './friend-service-client'
import { FriendStealHandler } from './friend-steal'

export class FriendWorker {
  private logger: Logger
  private isChecking = false
  private loopRunning = false
  private externalScheduler = false
  private scheduler: Scheduler
  private applicationsHandler: FriendApplicationsHandler
  private cycleHandler: FriendCycleHandler
  private helpHandler: FriendHelpHandler
  private interactHandler: FriendInteractHandler
  private landAnalyzer: FriendLandAnalyzer
  private loopHandler: FriendLoopHandler
  private operationLimitsHandler: FriendOperationLimits
  private publicApi: FriendPublicApi
  private serviceClient: FriendServiceClient
  private stealHandler: FriendStealHandler
  onLog: ((entry: { msg: string, tag?: string, meta?: Record<string, string>, isWarn?: boolean }) => void) | null = null

  constructor(
    private accountId: string,
    private client: IGameTransport,
    private gameConfig: GameConfigService,
    private store: StoreService,
    private sellAllFruits: () => Promise<number | void>,
    private platform: string,
    stats: StatsTracker
  ) {
    this.logger = new Logger(`Friend:${accountId}`)
    this.scheduler = new Scheduler(`friend-${accountId}`, this.logger)
    this.applicationsHandler = new FriendApplicationsHandler(
      () => this.getApplications(),
      gids => this.acceptFriends(gids),
      (msg, event) => this.log(msg, event),
      (msg, event) => this.warn(msg, event)
    )
    this.operationLimitsHandler = new FriendOperationLimits({
      log: (msg, event) => this.log(msg, event)
    })
    this.serviceClient = new FriendServiceClient(this.client, this.platform)
    this.landAnalyzer = new FriendLandAnalyzer({
      getPlantName: plantId => this.gameConfig.getPlantName(plantId)
    })
    this.cycleHandler = new FriendCycleHandler({
      accountId: this.accountId,
      store: this.store,
      gameConfig: this.gameConfig,
      getMyGid: () => this.client.userState.gid,
      getAllFriends: () => this.getAllFriends(),
      enterFriendFarm: gid => this.enterFriendFarm(gid),
      leaveFriendFarm: gid => this.leaveFriendFarm(gid),
      analyzeFriendLands: (lands, myGid) => this.analyzeFriendLands(lands, myGid),
      checkDailyReset: () => this.checkDailyReset(),
      canOperate: opId => this.canOperate(opId),
      shouldSkipFriendVisit: () => this.shouldSkipFriendVisit(),
      shuffleOrder: items => this.shuffleOrder(items),
      friendBatches: items => this.friendBatches(items),
      sellAllFruits: () => this.sellAllFruits(),
      executeHelpOps: (gid, status, stopWhenExpLimit, totalActions) => this.helpHandler.executeHelpOps(gid, status, stopWhenExpLimit, totalActions),
      executeStealOps: (gid, status, totalActions) => this.stealHandler.executeStealOps(gid, status, totalActions, this.sellAllFruits),
      executeBadOps: (gid, status, totalActions) => this.helpHandler.executeBadOps(gid, status, totalActions),
      getCanGetHelpExp: () => this.operationLimitsHandler.canGetHelpExpFlag,
      setCanGetHelpExp: (value) => { this.operationLimitsHandler.setCanGetHelpExp(value) },
      log: (msg, event) => this.log(msg, event),
      warn: (msg, event) => this.warn(msg, event)
    })
    this.helpHandler = new FriendHelpHandler(accountId, client, gameConfig, store, stats, this)
    this.interactHandler = new FriendInteractHandler(client, gameConfig, (msg, event) => this.warn(msg, event))
    this.loopHandler = new FriendLoopHandler({
      scheduler: this.scheduler,
      client: this.client,
      getLoopRunning: () => this.loopRunning,
      setLoopRunning: (value) => { this.loopRunning = value },
      getExternalScheduler: () => this.externalScheduler,
      setExternalScheduler: (value) => { this.externalScheduler = value },
      checkFriends: () => this.checkFriends(),
      checkAndAcceptApplications: () => this.checkAndAcceptApplications(),
      onFriendApplicationReceived: this.onFriendApplicationReceived
    })
    this.publicApi = new FriendPublicApi({
      gameConfig: this.gameConfig,
      getMyGid: () => this.client.userState.gid,
      getAllFriends: () => this.getAllFriends(),
      enterFriendFarm: gid => this.enterFriendFarm(gid),
      leaveFriendFarm: gid => this.leaveFriendFarm(gid),
      checkCanOperateRemote: (gid, operationId) => this.checkCanOperateRemote(gid, operationId),
      analyzeFriendLands: (lands, myGid) => this.analyzeFriendLands(lands, myGid),
      getFriendOpHandlers: () => this.friendOpHandlers
    })
    this.stealHandler = new FriendStealHandler(accountId, client, gameConfig, stats, this)
    this.friendOpHandlers = this.buildFriendOpHandlers()
  }

  private shuffleOrder<T>(items: T[]): T[] {
    return items
  }

  private async* friendBatches<T>(items: T[]): AsyncGenerator<T[]> {
    yield items
  }

  shouldSkipFriendVisit(): boolean {
    return false
  }

  private log(msg: string, event?: string) {
    this.logger.log(msg)
    this.onLog?.({ msg, tag: '好友', meta: { module: 'friend', ...(event && { event }) }, isWarn: false })
  }

  private warn(msg: string, event?: string) {
    this.logger.warn(msg)
    this.onLog?.({ msg, tag: '好友', meta: { module: 'friend', ...(event && { event }) }, isWarn: true })
  }

  // ========== Operation Limits (public for handlers) ==========

  get canGetHelpExpFlag(): boolean { return this.operationLimitsHandler.canGetHelpExpFlag }

  updateOperationLimits(limits: any[]) { this.operationLimitsHandler.update(limits) }

  private checkDailyReset() { this.operationLimitsHandler.checkDailyReset() }

  canGetExpByCandidates(opIds: number[]): boolean { return this.operationLimitsHandler.canGetExpByCandidates(opIds) }

  canOperate(opId: number): boolean { return this.operationLimitsHandler.canOperate(opId) }

  getRemainingTimes(opId: number): number { return this.operationLimitsHandler.getRemainingTimes(opId) }

  getOperationLimits(): Record<number, any> { return this.operationLimitsHandler.getOperationLimits(OP_TYPE_NAMES) }

  autoDisableHelpByExpLimit() { this.operationLimitsHandler.autoDisableHelpByExpLimit() }

  // ========== API ==========

  async getAllFriends(): Promise<any> { return this.serviceClient.getAllFriends() }

  async getApplications(): Promise<any> { return this.serviceClient.getApplications() }

  async acceptFriends(gids: number[]): Promise<any> { return this.serviceClient.acceptFriends(gids) }

  async enterFriendFarm(friendGid: number): Promise<any> { return this.serviceClient.enterFriendFarm(friendGid) }

  async leaveFriendFarm(friendGid: number) { await this.serviceClient.leaveFriendFarm(friendGid) }

  async checkCanOperateRemote(friendGid: number, operationId: number) { return this.serviceClient.checkCanOperateRemote(friendGid, operationId) }

  // ========== Land Analysis ==========

  analyzeFriendLands(lands: any[], myGid: number): FriendLandAnalysis { return this.landAnalyzer.analyzeFriendLands(lands, myGid) }

  // ========== Public API ==========

  async getFriendsList() { return this.publicApi.getFriendsList() }

  async getInteractRecords() { return await this.interactHandler.getInteractRecords() }

  async getFriendLandsDetail(friendGid: number) { return this.publicApi.getFriendLandsDetail(friendGid) }

  // ========== Manual Operation ==========

  private buildFriendOpHandlers(): Record<string, (status: FriendLandAnalysis, gid: number) => Promise<{ ok: boolean, opType: string, count?: number, message: string, bugCount?: number, weedCount?: number }>> {
    const helpHandlers = this.helpHandler.buildManualOpHandlers()
    const stealHandlers = this.stealHandler.buildManualStealHandler(
      (ids, batchFn, singleFn) => this.helpHandler.runBatchWithFallback(ids, batchFn, singleFn),
      this.sellAllFruits
    )
    return { ...stealHandlers, ...helpHandlers }
  }

  private friendOpHandlers: Record<string, (status: FriendLandAnalysis, gid: number) => Promise<{ ok: boolean, opType: string, count?: number, message: string, bugCount?: number, weedCount?: number }>>

  async doFriendOperation(friendGid: number, opType: string) { return this.publicApi.doFriendOperation(friendGid, opType) }

  // ========== Friend Loop ==========

  async checkFriends(): Promise<boolean> {
    if (!this.store.isAutomationOn('friend', this.accountId))
      return false
    const helpOn = this.store.isAutomationOn('friend_help', this.accountId)
    const stealOn = this.store.isAutomationOn('friend_steal', this.accountId)
    const badOn = this.store.isAutomationOn('friend_bad', this.accountId)
    if (this.isChecking || !this.client.userState.gid || !(helpOn || stealOn || badOn))
      return false

    this.isChecking = true

    try {
      return await this.cycleHandler.checkFriends()
    } finally {
      this.isChecking = false
    }
  }

  startFriendLoop(options: { externalScheduler?: boolean } = {}) { this.loopHandler.start(options) }

  stopFriendLoop() { this.loopHandler.stop() }

  refreshFriendLoop(delayMs = 200) { this.loopHandler.refresh(delayMs) }

  private async friendCheckLoop() { await this.loopHandler.friendCheckLoop() }

  // ========== Friend Applications ==========

  private onFriendApplicationReceived = (applications: any[]) => {
    this.applicationsHandler.handleApplicationReceived(applications)
  }

  async checkAndAcceptApplications() { await this.applicationsHandler.checkAndAcceptApplications() }

  destroy() { this.stopFriendLoop() }
}
