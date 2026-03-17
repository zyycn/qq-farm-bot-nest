import type { RequestIntentContext } from '../../common/request-intent/request-intent-context.service'
import type { StoreService } from '../../store/store.service'
import type { GameConfigService } from '../game-config.service'
import type { IGameTransport } from '../interfaces/game-transport.interface'
import type { AnalyticsWorker } from '../workers/analytics.worker'
import type { StatsTracker } from '../workers/stats.worker'
import { Logger } from '@nestjs/common'
import { Scheduler } from '@qq-farm/shared'
import { RequestIntentContextService } from '../../common/request-intent/request-intent-context.service'
import { isInteractiveRequest } from '../interfaces/request-context.interface'
import { getServerTimeSec, toNum } from '../utils'
import { FarmActions } from './farm-actions'
import { BagState } from './state/bag-state'
import { LandsState } from './state/lands-state'
import { UserStateMirror } from './state/user-state'
import { WarehouseActions } from './warehouse-actions'

export interface GameSessionCallbacks {
  onLog?: (entry: { msg: string, tag?: string, meta?: Record<string, string>, isWarn?: boolean }) => void
  onLandsUpdate?: (data: unknown) => void
  onBagUpdate?: (data: unknown) => void
}

interface SessionTask<T = unknown> {
  label: string
  order: number
  priority: number
  requestContext?: RequestIntentContext
  task: () => Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

export class GameSession {
  private static readonly LANDS_CALIBRATION_MS = 5 * 60 * 1000
  private static readonly BAG_CALIBRATION_MS = 10 * 60 * 1000
  private static readonly PUSH_DEBOUNCE_MS = 150

  private readonly logger: Logger
  private readonly scheduler: Scheduler
  private readonly landsState = new LandsState()
  private readonly bagState = new BagState()
  private readonly userState = new UserStateMirror()
  private readonly farmActions: FarmActions
  private readonly warehouseActions: WarehouseActions

  private destroyed = false
  private lastLandsSyncAt = 0
  private lastBagSyncAt = 0
  private bootstrapped = false
  private processing = false
  private taskOrder = 0
  private readonly pendingTasks: SessionTask[] = []

  constructor(
    private readonly accountId: string,
    private readonly transport: IGameTransport,
    private readonly gameConfig: GameConfigService,
    private readonly store: StoreService,
    private readonly stats: StatsTracker,
    analytics: AnalyticsWorker,
    private readonly callbacks: GameSessionCallbacks
  ) {
    this.logger = new Logger(`GameSession:${accountId}`)
    this.scheduler = new Scheduler(`game-session-${accountId}`, this.logger)
    this.farmActions = new FarmActions(accountId, transport, gameConfig, store, stats, analytics, {
      onLog: callbacks.onLog,
      getCurrentLands: () => this.landsState.getAll(),
      getBagSeeds: () => this.bagState.getSeedSnapshot(this.gameConfig),
      onFullSync: (lands) => {
        this.landsState.applyFull(lands)
        this.lastLandsSyncAt = Date.now()
        this.afterLandsChanged()
      },
      onLandDelta: (lands) => {
        if (this.landsState.applyDelta(lands))
          this.afterLandsChanged()
      }
    })
    this.warehouseActions = new WarehouseActions(accountId, transport, gameConfig, store, stats, {
      onLog: callbacks.onLog,
      getRawBagItems: () => this.bagState.getRawItems()
    })
  }

  async bootstrap() {
    await this.enqueue('bootstrap', async () => {
      await this.syncLandsUnsafe()
      await this.syncBagUnsafe()
    })
    this.bootstrapped = true
    this.kickStartFarmAutomation()
  }

  destroy() {
    this.destroyed = true
    this.scheduler.clearAll()
  }

  onConfigChanged() {
    this.rescheduleLandTimers()
    this.kickStartFarmAutomation()
  }

  handleServerTime(ms: number) {
    this.userState.updateServerTime(ms)
    this.rescheduleLandTimers()
  }

  handleNotify(data: any) {
    const kind = String(data?.kind || '')
    const decoded = data?.decoded

    if (kind === 'item' && Array.isArray(decoded?.items)) {
      if (this.bagState.applyDelta(decoded.items))
        this.afterBagChanged()
      if (this.store.isAutomationOn('sell', this.accountId)) {
        this.scheduler.setTimeoutTask('sell_after_item_notify', 1500, () => {
          void this.sellAllFruits()
        })
      }
      return
    }

    if (kind === 'basic' && decoded?.basic) {
      const changes: any[] = []
      if (Object.hasOwn(decoded.basic, 'gold'))
        changes.push({ item: { id: 1001, count: toNum(decoded.basic.gold) }, delta: 0 })
      if (Object.hasOwn(decoded.basic, 'exp'))
        changes.push({ item: { id: 1101, count: toNum(decoded.basic.exp) }, delta: 0 })
      if (changes.length && this.bagState.applyDelta(changes))
        this.afterBagChanged()
    }

    if (kind === 'lands' && Array.isArray(decoded?.lands)) {
      if (this.landsState.applyDelta(decoded.lands)) {
        this.afterLandsChanged()
        const auto = this.store.getAutomation(this.accountId)
        if (auto.farm_manage && (auto.farm_water || auto.farm_weed || auto.farm_bug)) {
          this.scheduler.setTimeoutTask('clear_after_lands_notify', 500, () => {
            void this.runFarmOperation('clear')
          })
        }
      }
    }
  }

  async runScheduledAutomationPass(): Promise<boolean> {
    let hadWork = false
    for (const stage of this.getScheduledAutomationStages()) {
      const stageHadWork = await this.enqueue(`scheduled-farm-pass:${stage}`, async () => {
        await this.calibrateIfNeeded()
        const result = await this.runFarmOperationUnsafe(stage)
        return !!result.hadWork
      }) as boolean
      hadWork = hadWork || stageHadWork
    }
    return hadWork
  }

  async runFarmOperation(opType: string) {
    return await this.enqueue(`farm-op:${opType}`, async () => this.runFarmOperationUnsafe(opType))
  }

  async runHarvestThenPlant() {
    await this.enqueue('timer-harvest', async () => {
      await this.calibrateIfNeeded()
      return await this.runFarmOperationUnsafe('harvest')
    })
    return await this.enqueue('timer-plant', async () => await this.runFarmOperationUnsafe('plant'))
  }

  async runSingleLandOperation(payload: { action: string, landId: number, seedId: number }) {
    return await this.enqueue(`single-land:${payload.action}:${payload.landId}`, async () => {
      await this.ensureLandsReady()
      const result = await this.farmActions.runSingleLandOperation(payload)
      this.scheduleFollowAfterSingleLandOperation(payload)
      return result
    })
  }

  async sellItem(itemId: number, count: number) {
    return await this.enqueue(`sell-item:${itemId}`, async () => {
      await this.ensureBagReady()
      return await this.warehouseActions.sellItemByIdAndCount(itemId, count)
    })
  }

  async buySeed(goodsId: number, count: number, price: number) {
    return await this.enqueue(`buy-seed:${goodsId}`, async () => {
      const result = await this.farmActions.buyGoods(goodsId, count, price)
      const items = result?.get_items || []
      if (items.length > 0) {
        const seedId = Number(items[0]?.id) || 0
        const name = this.gameConfig.getPlantNameBySeedId(seedId) || `商品${goodsId}`
        this.log(`手动购买 ${name} x${count}，花费 ${price * count} 金币`, 'seed_buy')
      }
      return result
    })
  }

  async sellAllFruits() {
    return await this.enqueue('sell-all-fruits', async () => await this.sellAllFruitsUnsafe())
  }

  async autoOpenFertilizerGiftPacks() {
    return await this.enqueue('fertilizer-gifts', async () => {
      await this.syncBagUnsafe()
      const count = await this.warehouseActions.autoOpenFertilizerGiftPacks()
      if (count > 0)
        await this.syncBagUnsafe()
      return count
    })
  }

  async getLandsDetail() {
    await this.ensureLandsReady()
    return this.landsState.getDetailSnapshot(this.gameConfig)
  }

  async getAvailableSeeds() {
    return await this.farmActions.getAvailableSeeds()
  }

  async getBagDetail() {
    await this.ensureBagReady()
    return this.bagState.getDetailSnapshot(this.gameConfig)
  }

  async getBagSeeds() {
    await this.ensureBagReady()
    return this.bagState.getSeedSnapshot(this.gameConfig)
  }

  getRawBagItems() {
    return this.bagState.getRawItems()
  }

  getCouponBalance() {
    return this.bagState.getItemCount(1002)
  }

  getFertilizerGiftDailyState() {
    return this.warehouseActions.getFertilizerGiftDailyState()
  }

  private async runFarmOperationUnsafe(opType: string) {
    await this.ensureLandsReady()
    const result = await this.farmActions.runFarmOperation(opType)
    if ((opType === 'all' || opType === 'harvest') && result.hadWork)
      await this.sellAllFruitsUnsafe()
    return result
  }

  private scheduleFollowAfterSingleLandOperation(payload: { action: string, landId: number }) {
    if (payload.action !== 'remove')
      return
    if (!this.store.isAutomationOn('farm', this.accountId))
      return

    void this.enqueue(`single-land-followup:plant:${payload.landId}`, async () => {
      await this.runFarmOperationUnsafe('plant')
      return null
    })
  }

  private async sellAllFruitsUnsafe() {
    await this.ensureBagReady()
    return await this.warehouseActions.sellAllFruits()
  }

  private async syncLandsUnsafe() {
    await this.farmActions.syncLands()
  }

  private async syncBagUnsafe() {
    const reply = await this.warehouseActions.syncBag()
    this.bagState.applyFull(reply)
    this.lastBagSyncAt = Date.now()
    this.afterBagChanged()
  }

  private async ensureLandsReady() {
    if (!this.landsState.getAll().length)
      await this.syncLandsUnsafe()
  }

  private async ensureBagReady() {
    if (!this.bagState.getRawItems().length)
      await this.syncBagUnsafe()
  }

  private async calibrateIfNeeded() {
    const now = Date.now()
    if (!this.landsState.getAll().length || now - this.lastLandsSyncAt >= GameSession.LANDS_CALIBRATION_MS)
      await this.syncLandsUnsafe()
    if (!this.bagState.getRawItems().length || now - this.lastBagSyncAt >= GameSession.BAG_CALIBRATION_MS)
      await this.syncBagUnsafe()
  }

  private afterLandsChanged() {
    this.scheduleLandsPush()
    this.rescheduleLandTimers()
  }

  private afterBagChanged() {
    this.scheduleBagPush()
  }

  private scheduleLandsPush() {
    this.scheduler.setTimeoutTask('push-lands-snapshot', GameSession.PUSH_DEBOUNCE_MS, () => {
      if (this.destroyed)
        return
      this.callbacks.onLandsUpdate?.(this.landsState.getDetailSnapshot(this.gameConfig))
    })
  }

  private scheduleBagPush() {
    this.scheduler.setTimeoutTask('push-bag-snapshot', GameSession.PUSH_DEBOUNCE_MS, () => {
      if (this.destroyed)
        return
      this.callbacks.onBagUpdate?.(this.bagState.getDetailSnapshot(this.gameConfig))
    })
  }

  private rescheduleLandTimers() {
    for (const taskName of this.scheduler.getTaskNames()) {
      if (taskName.startsWith('land-timer:'))
        this.scheduler.clear(taskName)
    }

    if (!this.store.isAutomationOn('farm', this.accountId))
      return

    const nowSec = getServerTimeSec()
    for (const [landId, matureAt] of this.landsState.getHarvestTimers()) {
      if (!matureAt)
        continue
      const delayMs = Math.max(0, (matureAt - nowSec) * 1000) + 200
      this.scheduler.setTimeoutTask(`land-timer:harvest:${landId}`, delayMs, () => {
        void this.runHarvestThenPlant()
      })
    }

    const automation = this.store.getAutomation(this.accountId)
    const shouldManage = automation.farm_manage
    if (!shouldManage)
      return

    for (const [landId, issueAt] of this.landsState.getIssueTimers()) {
      if (automation.farm_water && issueAt.dryAt > 0) {
        const delayMs = Math.max(0, (issueAt.dryAt - nowSec) * 1000) + 200
        this.scheduler.setTimeoutTask(`land-timer:water:${landId}`, delayMs, () => {
          void this.runFarmOperation('clear')
        })
      }
      if (automation.farm_weed && issueAt.weedAt > 0) {
        const delayMs = Math.max(0, (issueAt.weedAt - nowSec) * 1000) + 200
        this.scheduler.setTimeoutTask(`land-timer:weed:${landId}`, delayMs, () => {
          void this.runFarmOperation('clear')
        })
      }
      if (automation.farm_bug && issueAt.bugAt > 0) {
        const delayMs = Math.max(0, (issueAt.bugAt - nowSec) * 1000) + 200
        this.scheduler.setTimeoutTask(`land-timer:bug:${landId}`, delayMs, () => {
          void this.runFarmOperation('clear')
        })
      }
    }
  }

  private kickStartFarmAutomation() {
    if (this.destroyed || !this.bootstrapped)
      return
    if (!this.store.isAutomationOn('farm', this.accountId))
      return

    const derived = this.landsState.getDerived(this.gameConfig)
    const hasWork = (derived.harvestable.length + derived.dead.length + derived.empty.length + derived.needWater.length + derived.needWeed.length + derived.needBug.length) > 0
      || (this.store.isAutomationOn('land_upgrade', this.accountId) && (derived.unlockable.length + derived.upgradable.length) > 0)
    if (!hasWork)
      return

    void this.runScheduledAutomationPass()
  }

  private getScheduledAutomationStages(): string[] {
    const stages = ['clear', 'harvest', 'plant']
    if (this.store.isAutomationOn('land_upgrade', this.accountId))
      stages.push('upgrade')
    return stages
  }

  private enqueue<T>(label: string, task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pendingTasks.push({
        label,
        order: this.taskOrder++,
        priority: isInteractiveRequest() ? 1 : 0,
        requestContext: RequestIntentContextService.getCurrent(),
        task,
        resolve,
        reject
      })
      this.pendingTasks.sort((left, right) => (right.priority - left.priority) || (left.order - right.order))
      void this.processPendingTasks()
    })
  }

  private async processPendingTasks(): Promise<void> {
    if (this.processing || this.destroyed)
      return

    this.processing = true
    try {
      while (this.pendingTasks.length > 0) {
        const nextTask = this.pendingTasks.shift()
        if (!nextTask)
          continue

        try {
          const result = nextTask.requestContext
            ? await RequestIntentContextService.runWith(nextTask.requestContext, () => nextTask.task())
            : await nextTask.task()
          nextTask.resolve(result)
        } catch (error) {
          this.warn(this.formatSessionErrorMessage(error), 'session_error', { action: nextTask.label })
          nextTask.reject(error)
        }
      }
    } finally {
      this.processing = false
      if (this.pendingTasks.length > 0)
        void this.processPendingTasks()
    }
  }

  private formatSessionErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message)
      return error.message
    const text = String(error || '').trim()
    return text || '执行失败'
  }

  private log(msg: string, event?: string, extraMeta?: Record<string, string>) {
    this.logger.log(msg)
    this.callbacks.onLog?.({ msg, tag: '系统', meta: { module: 'system', ...(event && { event }), ...(extraMeta || {}) }, isWarn: false })
  }

  private warn(msg: string, event?: string, extraMeta?: Record<string, string>) {
    this.logger.warn(msg)
    this.callbacks.onLog?.({ msg, tag: '系统', meta: { module: 'system', ...(event && { event }), ...(extraMeta || {}) }, isWarn: true })
  }
}
