import type { AccountConfigService } from '../../store/account-config.service'
import type { GameConfigService } from '../game-config.service'
import type { IGameTransport } from '../interfaces/game-transport.interface'
import type { GameOperationKey } from '../rpc/operation-catalog'
import type { AnalyticsWorker } from '../workers/analytics.worker'
import type { StatsTracker } from '../workers/stats.worker'
import type { OwnedLandStatus } from './helpers/land.helpers'
import { Logger } from '@nestjs/common'
import { getLandTypeByLevel, PlantPhase } from '../constants'
import { GameRpcExecutor } from '../rpc/game-rpc-executor'
import { toNum } from '../utils'
import { analyzeOwnedLands, getCurrentPhase, getMultiSeasonGrowingLandIds } from './helpers/land.helpers'

const NORMAL_FERTILIZER_ID = 1011
const ORGANIC_FERTILIZER_ID = 1012

export interface FarmActionsOptions {
  onLog?: (entry: { msg: string, tag?: string, meta?: Record<string, string>, isWarn?: boolean }) => void
  getCurrentLands: () => any[]
  getBagSeeds: () => Array<{ seedId: number, name: string, count: number, requiredLevel: number, image: string, plantSize: number }>
  onFullSync: (lands: any[]) => void
  onLandDelta: (lands: any[]) => void
}

export class FarmActions {
  private readonly logger: Logger
  private readonly rpc: GameRpcExecutor

  constructor(
    private readonly accountId: string,
    private readonly client: IGameTransport,
    private readonly gameConfig: GameConfigService,
    private readonly accountConfig: AccountConfigService,
    private readonly stats: StatsTracker,
    private readonly analytics: AnalyticsWorker,
    private readonly options: FarmActionsOptions
  ) {
    this.logger = new Logger(`FarmActions:${accountId}`)
    this.rpc = new GameRpcExecutor(this.client)
  }

  private shuffleOrder<T>(items: T[]): T[] {
    return items
  }

  private log(msg: string, event?: string) {
    this.logger.log(msg)
    this.options.onLog?.({ msg, tag: '农场', meta: { module: 'farm', ...(event && { event }) }, isWarn: false })
  }

  private warn(msg: string, event?: string) {
    this.logger.warn(msg)
    this.options.onLog?.({ msg, tag: '农场', meta: { module: 'farm', ...(event && { event }) }, isWarn: true })
  }

  private formatActionError(prefix: string, error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error || '')
    return new Error(message ? `${prefix}: ${message}` : prefix)
  }

  async syncLands(): Promise<any> {
    const { data } = await this.rpc.call<any>('farm.allLands', {})
    this.options.onFullSync((data?.lands || []) as any[])
    return data ?? {}
  }

  async harvest(landIds: number[]): Promise<any> {
    const { data } = await this.rpc.call<any>('farm.harvest', {
      land_ids: landIds,
      host_gid: this.client.userState.gid,
      is_all: true
    })
    this.options.onLandDelta(data?.land || [])
    return data ?? {}
  }

  async waterLand(landIds: number[]) {
    return this.sendPlantRequest('WaterLand', landIds, this.client.userState.gid)
  }

  async weedOut(landIds: number[]) {
    return this.sendPlantRequest('WeedOut', landIds, this.client.userState.gid)
  }

  async insecticide(landIds: number[]) {
    return this.sendPlantRequest('Insecticide', landIds, this.client.userState.gid)
  }

  async fertilize(landIds: number[], fertilizerId = NORMAL_FERTILIZER_ID): Promise<number> {
    const ids = this.shuffleOrder(landIds.map(toNum).filter(id => Number.isFinite(id) && id > 0))
    if (!ids.length)
      return 0

    if (ids.length > 1) {
      try {
        const { data } = await this.rpc.call<any>('farm.fertilize', {
          land_ids: ids,
          fertilizer_id: fertilizerId
        })
        this.options.onLandDelta(data?.land || [])
        return ids.length
      } catch {}
    }

    let success = 0
    const changed: any[] = []
    for (const landId of ids) {
      try {
        const { data } = await this.rpc.call<any>('farm.fertilize', {
          land_ids: [landId],
          fertilizer_id: fertilizerId
        })
        success++
        if (data?.land?.length)
          changed.push(...data.land)
      } catch { break }
    }

    if (changed.length)
      this.options.onLandDelta(changed)
    return success
  }

  async removePlant(landIds: number[]): Promise<any> {
    const { data } = await this.rpc.call<any>('farm.removePlant', { land_ids: landIds })
    this.options.onLandDelta(data?.land || [])
    return data ?? {}
  }

  async upgradeLand(landId: number): Promise<any> {
    const { data } = await this.rpc.call<any>('farm.upgradeLand', { land_id: landId })
    this.options.onLandDelta(data?.land ? [data.land] : [])
    return data ?? {}
  }

  async unlockLand(landId: number, doShared = false): Promise<any> {
    const { data } = await this.rpc.call<any>('farm.unlockLand', { land_id: landId, do_shared: doShared })
    this.options.onLandDelta(data?.land ? [data.land] : [])
    return data ?? {}
  }

  async getShopInfo(shopId: number): Promise<any> {
    const { data } = await this.rpc.call<any>('shop.shopInfo', { shop_id: shopId })
    return data ?? {}
  }

  async buyGoods(goodsId: number, num: number, price: number): Promise<any> {
    const { data } = await this.rpc.call<any>('shop.buyGoods', { goods_id: goodsId, num, price })
    return data ?? {}
  }

  async plantSeeds(seedId: number, landIds: number[], options?: { maxPlantCount?: number }): Promise<{ planted: number, plantedLandIds: number[], occupiedLandIds: number[] }> {
    const ids = this.shuffleOrder((Array.isArray(landIds) ? landIds : []).map(id => toNum(id)).filter(Boolean))
    const maxCount = Math.max(0, toNum(options?.maxPlantCount) || Number.POSITIVE_INFINITY)
    const targetIds = ids.slice(0, maxCount > 0 && Number.isFinite(maxCount) ? maxCount : ids.length)
    if (!targetIds.length)
      return { planted: 0, plantedLandIds: [], occupiedLandIds: [] }

    let success = 0
    const plantedLandIds: number[] = []
    const occupiedLandIds = new Set<number>()
    const changed: any[] = []
    for (const landId of targetIds) {
      try {
        const { data } = await this.rpc.call<any>('farm.plant', {
          items: [{ seed_id: seedId, land_ids: [landId] }]
        })
        success++
        plantedLandIds.push(landId)
        occupiedLandIds.add(landId)
        if (data?.land?.length)
          changed.push(...data.land)
      } catch (error: any) {
        this.warn(`土地#${landId} 种植失败: ${error?.message}`, 'plant_seed')
      }
    }

    if (changed.length)
      this.options.onLandDelta(changed)
    return { planted: success, plantedLandIds, occupiedLandIds: [...occupiedLandIds] }
  }

  async getAvailableSeeds() {
    try {
      const shopReply = await this.getShopInfo(2)
      if (!shopReply?.goods_list?.length)
        return this.gameConfig.getAllSeeds()
      const state = this.client.userState
      return shopReply.goods_list.map((goods: any) => {
        let requiredLevel = 0
        for (const cond of goods?.conds || []) {
          if (toNum(cond?.type) === 1)
            requiredLevel = toNum(cond?.param)
        }
        const limitCount = toNum(goods?.limit_count)
        const seedId = toNum(goods?.item_id)
        return {
          seedId,
          goodsId: toNum(goods?.id),
          name: this.gameConfig.getPlantNameBySeedId(seedId),
          price: toNum(goods?.price),
          requiredLevel,
          locked: !goods?.unlocked || state.level < requiredLevel,
          soldOut: limitCount > 0 && toNum(goods?.bought_num) >= limitCount,
          image: this.gameConfig.getSeedImageBySeedId(seedId)
        }
      }).sort((a: any, b: any) => (a.requiredLevel ?? 9999) - (b.requiredLevel ?? 9999))
    } catch {
      return this.gameConfig.getAllSeeds()
    }
  }

  private async sendPlantRequest(method: string, landIds: number[], hostGid: number): Promise<any> {
    const operationMap: Record<string, GameOperationKey> = {
      WaterLand: 'farm.waterLand',
      WeedOut: 'farm.weedOut',
      Insecticide: 'farm.insecticide'
    }
    const operation = operationMap[method]
    if (!operation)
      throw new Error(`不支持的农场操作: ${method}`)

    const { data } = await this.rpc.call<any>(operation, {
      land_ids: landIds,
      host_gid: hostGid
    })
    this.options.onLandDelta(data?.land || [])
    return data ?? {}
  }

  private buildClearOps(status: OwnedLandStatus, actions: string[]): Promise<any>[] {
    const cfg = this.accountConfig.getAccountConfig(this.accountId)
    const auto = cfg.automation as any
    const ops: Promise<any>[] = []

    if (auto.farm_manage) {
      if (auto.farm_weed && status.needWeed.length) {
        ops.push(this.weedOut(status.needWeed).then(() => {
          actions.push(`除草${status.needWeed.length}`)
          this.stats.recordOperation('weed', status.needWeed.length)
        }).catch(() => {}))
      }
      if (auto.farm_bug && status.needBug.length) {
        ops.push(this.insecticide(status.needBug).then(() => {
          actions.push(`除虫${status.needBug.length}`)
          this.stats.recordOperation('bug', status.needBug.length)
        }).catch(() => {}))
      }
      if (auto.farm_water && status.needWater.length) {
        ops.push(this.waterLand(status.needWater).then(() => {
          actions.push(`浇水${status.needWater.length}`)
          this.stats.recordOperation('water', status.needWater.length)
        }).catch(() => {}))
      }
    }

    return ops
  }

  private buildStatusStr(status: OwnedLandStatus): string {
    const parts: string[] = []
    if (status.harvestable.length)
      parts.push(`收:${status.harvestable.length}`)
    if (status.needWeed.length)
      parts.push(`草:${status.needWeed.length}`)
    if (status.needBug.length)
      parts.push(`虫:${status.needBug.length}`)
    if (status.needWater.length)
      parts.push(`水:${status.needWater.length}`)
    if (status.dead.length)
      parts.push(`枯:${status.dead.length}`)
    if (status.empty.length)
      parts.push(`空:${status.empty.length}`)
    parts.push(`长:${status.growing.length}`)
    return parts.join(' ')
  }

  async runFarmOperation(opType: string): Promise<{ hadWork: boolean, actions: string[] }> {
    let lands = this.options.getCurrentLands()
    if (!lands.length) {
      const reply = await this.syncLands()
      lands = reply?.lands || []
    }
    if (!lands.length)
      return { hadWork: false, actions: [] }

    const status = analyzeOwnedLands(lands, this.gameConfig)
    const actions: string[] = []

    if (opType === 'all' || opType === 'clear') {
      const batchOps = this.buildClearOps(status, actions)
      if (batchOps.length)
        await Promise.all(batchOps)
    }

    let harvestedIds: number[] = []
    if (opType === 'all' || opType === 'harvest') {
      if (status.harvestable.length) {
        try {
          await this.harvest(status.harvestable)
          actions.push(`收获${status.harvestable.length}`)
          this.stats.recordOperation('harvest', status.harvestable.length)
          harvestedIds = [...status.harvestable]
        } catch {}
      }
    }

    const cfg = this.accountConfig.getAccountConfig(this.accountId)
    if ((opType === 'all' || opType === 'harvest') && harvestedIds.length > 0 && cfg.fertilizerMultiSeason) {
      const currentLands = this.options.getCurrentLands()
      const multiSeasonGrowing = getMultiSeasonGrowingLandIds(currentLands, this.gameConfig)
      if (multiSeasonGrowing.length > 0)
        await this.runFertilizerByConfig(multiSeasonGrowing, { reason: 'multi_season' })
    }

    if (opType === 'all' || opType === 'plant') {
      const allEmpty = [...new Set<number>(status.empty)]
      let allDead = [...new Set<number>(status.dead)]
      if (opType === 'all' && harvestedIds.length)
        allDead = [...new Set([...allDead, ...harvestedIds])]
      if (allDead.length || allEmpty.length) {
        try {
          await this.autoPlantEmptyLands(allDead, allEmpty)
          actions.push(`种植${allDead.length + allEmpty.length}`)
          this.stats.recordOperation('plant', allDead.length + allEmpty.length)
        } catch {}
      }
    }

    const shouldAutoUpgrade = opType === 'all' && this.accountConfig.isAutomationOn('land_upgrade', this.accountId)
    if (shouldAutoUpgrade || opType === 'upgrade') {
      let unlocked = 0
      for (const landId of this.shuffleOrder(status.unlockable)) {
        try {
          await this.unlockLand(landId, false)
          actions.push('解锁1')
          unlocked++
        } catch {}
      }
      if (unlocked > 0)
        this.log(`自动解锁土地 x${unlocked}`, 'unlock_land')

      let upgraded = 0
      for (const landId of this.shuffleOrder(status.upgradable)) {
        try {
          await this.upgradeLand(landId)
          actions.push('升级1')
          this.stats.recordOperation('upgrade', 1)
          upgraded++
        } catch {}
      }
      if (upgraded > 0)
        this.log(`自动升级土地 x${upgraded}`, 'upgrade_land')
    }

    if (actions.length)
      this.log(`[${this.buildStatusStr(status)}] → ${actions.join('/')}`, 'farm_cycle')
    return { hadWork: actions.length > 0, actions }
  }

  async runSingleLandOperation(payload: { action: string, landId: number, seedId: number }) {
    const { action, landId, seedId } = payload
    if (!landId || !Number.isFinite(landId))
      throw new Error('无效地块编号')

    if (action === 'remove') {
      await this.removePlant([landId])
      return { action: 'remove', landId }
    }

    if (action === 'plant') {
      if (!seedId || !Number.isFinite(seedId))
        throw new Error('缺少种子编号')
      const plantSize = this.gameConfig.getPlantSizeBySeedId(seedId)
      if (plantSize > 1)
        throw new Error(`仅支持 1x1 种子，当前为 ${plantSize}x${plantSize}`)

      try {
        const { data } = await this.rpc.call<any>('farm.plant', {
          items: [{ seed_id: seedId, land_ids: [landId] }]
        })
        this.options.onLandDelta(data?.land || [])
        return { action: 'plant', landId, seedId, planted: 1 }
      } catch (error) {
        throw this.formatActionError(`地块 #${landId} 种植失败`, error)
      }
    }

    if (action === 'organic_fertilize') {
      try {
        const { data } = await this.rpc.call<any>('farm.fertilize', {
          land_ids: [landId],
          fertilizer_id: ORGANIC_FERTILIZER_ID
        })
        this.options.onLandDelta(data?.land || [])
        return { action: 'organic_fertilize', landId, fertilized: 1 }
      } catch (error) {
        throw this.formatActionError(`地块 #${landId} 施有机肥失败`, error)
      }
    }

    throw new Error(`不支持的单地块操作: ${action || '未知操作'}`)
  }

  async runFertilizerByConfig(plantedLands: number[] = [], options?: { reason?: 'multi_season' | 'normal' }): Promise<{ normal: number, organic: number }> {
    const cfg = this.accountConfig.getAccountConfig(this.accountId)
    const fertilizerConfig = cfg.fertilizer || 'both'
    const landTypes = (cfg.fertilizerLandTypes?.length ? cfg.fertilizerLandTypes : ['gold', 'black', 'red', 'normal']) as string[]
    const allowedTypes = new Set(landTypes)
    const eventTag = options?.reason === 'multi_season' ? 'fertilize_multi' : 'fertilize'
    let fertilizedNormal = 0
    let fertilizedOrganic = 0

    const currentLands = this.options.getCurrentLands()
    const idToLevel = new Map<number, number>()
    for (const land of currentLands)
      idToLevel.set(toNum(land?.id), toNum(land?.level))

    let candidateIds = plantedLands.filter(Boolean)
    if (candidateIds.length === 0) {
      candidateIds = currentLands
        .filter((land: any) => land?.unlocked && land?.plant?.phases?.length)
        .map((land: any) => toNum(land?.id))
    }
    candidateIds = candidateIds.filter(id => allowedTypes.has(getLandTypeByLevel(idToLevel.get(id) ?? 0)))

    if ((fertilizerConfig === 'normal' || fertilizerConfig === 'both') && candidateIds.length > 0) {
      fertilizedNormal = await this.fertilize(candidateIds, NORMAL_FERTILIZER_ID)
      if (fertilizedNormal > 0) {
        this.log(`已为 ${fertilizedNormal}/${candidateIds.length} 块地施无机化肥`, eventTag)
        this.stats.recordOperation('fertilize', fertilizedNormal)
      }
    }

    if (fertilizerConfig === 'organic' || fertilizerConfig === 'both') {
      const organicCandidates = candidateIds.filter((landId) => {
        const land = currentLands.find(item => toNum(item?.id) === landId)
        const phase = getCurrentPhase(land?.plant?.phases || [])
        return !!phase && toNum(phase?.phase) !== PlantPhase.MATURE && toNum(phase?.phase) !== PlantPhase.DEAD
      })
      if (organicCandidates.length > 0) {
        fertilizedOrganic = await this.fertilize(organicCandidates, ORGANIC_FERTILIZER_ID)
        if (fertilizedOrganic > 0) {
          this.log(`已为 ${fertilizedOrganic}/${organicCandidates.length} 块地施有机化肥`, eventTag)
          this.stats.recordOperation('fertilize', fertilizedOrganic)
        }
      }
    }

    return { normal: fertilizedNormal, organic: fertilizedOrganic }
  }

  private async autoPlantEmptyLands(deadLandIds: number[], emptyLandIds: number[]) {
    let landsToPlant = [...emptyLandIds]
    if (deadLandIds.length) {
      try {
        await this.removePlant(deadLandIds)
        landsToPlant.push(...deadLandIds)
      } catch {
        landsToPlant.push(...deadLandIds)
      }
    }
    if (!landsToPlant.length)
      return

    const strategy = this.accountConfig.getPlantingStrategy(this.accountId)
    if (strategy === 'bag_priority') {
      const plantedByBag = await this.plantFromBagSeeds(landsToPlant)
      if (plantedByBag)
        return
    }

    const bestSeed = await this.findBestSeed()
    if (!bestSeed)
      return

    const plantSize = this.gameConfig.getPlantSizeBySeedId(bestSeed.seedId)
    const landFootprint = plantSize * plantSize
    let needCount = landsToPlant.length
    if (landFootprint > 1)
      needCount = Math.floor(landsToPlant.length / landFootprint)
    if (needCount <= 0)
      return

    const totalCost = bestSeed.price * needCount
    if (totalCost > this.client.userState.gold) {
      const canBuy = Math.floor(this.client.userState.gold / bestSeed.price)
      if (canBuy <= 0)
        return
      needCount = canBuy
      landsToPlant = landsToPlant.slice(0, needCount)
    }

    let actualSeedId = bestSeed.seedId
    try {
      const buyReply = await this.buyGoods(bestSeed.goodsId, needCount, bestSeed.price)
      const seedName = this.gameConfig.getPlantNameBySeedId(bestSeed.seedId)
      this.log(`购买 ${seedName} x${needCount}，花费 ${bestSeed.price * needCount} 金币`, 'seed_buy')
      if (buyReply?.get_items?.[0])
        actualSeedId = toNum(buyReply.get_items[0]?.id) || actualSeedId
    } catch {
      return
    }

    const { planted, plantedLandIds } = await this.plantSeeds(actualSeedId, landsToPlant, { maxPlantCount: needCount })
    if (planted > 0)
      await this.runFertilizerByConfig(plantedLandIds)
  }

  private sortBagSeedsByPriority<T extends { seedId: number, requiredLevel: number }>(bagSeeds: T[], priority: number[]): T[] {
    if (!priority?.length)
      return bagSeeds.toSorted((a, b) => b.requiredLevel - a.requiredLevel)
    const priorityMap = new Map<number, number>()
    priority.forEach((id, index) => priorityMap.set(id, index))
    return bagSeeds.toSorted((a, b) => {
      const pa = priorityMap.has(a.seedId) ? priorityMap.get(a.seedId)! : Number.MAX_SAFE_INTEGER
      const pb = priorityMap.has(b.seedId) ? priorityMap.get(b.seedId)! : Number.MAX_SAFE_INTEGER
      if (pa !== pb)
        return pa - pb
      return b.requiredLevel - a.requiredLevel
    })
  }

  private async plantFromBagSeeds(landsToPlant: number[]): Promise<boolean> {
    const seeds = this.options.getBagSeeds()
    if (!seeds?.length)
      return false

    const priority = this.accountConfig.getBagSeedPriority(this.accountId)
    const sorted = this.sortBagSeedsByPriority(seeds, priority)
    const available = sorted.find(seed => seed.count > 0 && (seed.plantSize || 1) === 1)
    if (!available)
      return false

    const needCount = Math.min(landsToPlant.length, available.count)
    if (needCount <= 0)
      return false

    try {
      const { planted, plantedLandIds } = await this.plantSeeds(available.seedId, landsToPlant.slice(0, needCount), { maxPlantCount: needCount })
      if (planted <= 0)
        return false
      await this.runFertilizerByConfig(plantedLandIds)
      this.stats.recordOperation('plant', planted)
      return true
    } catch {
      return false
    }
  }

  private async findBestSeed(): Promise<{ goodsId: number, seedId: number, price: number, requiredLevel: number } | null> {
    const shopReply = await this.getShopInfo(2)
    if (!shopReply?.goods_list?.length)
      return null

    const state = this.client.userState
    const available: any[] = []
    for (const goods of shopReply.goods_list) {
      if (!goods?.unlocked)
        continue
      let meetsConditions = true
      let requiredLevel = 0
      for (const cond of goods?.conds || []) {
        if (toNum(cond?.type) === 1) {
          requiredLevel = toNum(cond?.param)
          if (state.level < requiredLevel) {
            meetsConditions = false
            break
          }
        }
      }
      if (!meetsConditions)
        continue
      const limitCount = toNum(goods?.limit_count)
      if (limitCount > 0 && toNum(goods?.bought_num) >= limitCount)
        continue
      available.push({
        goodsId: toNum(goods?.id),
        seedId: toNum(goods?.item_id),
        price: toNum(goods?.price),
        requiredLevel
      })
    }

    if (!available.length)
      return null

    const strategy = this.accountConfig.getPlantingStrategy(this.accountId)
    const analyticsSortMap: Record<string, string> = {
      max_exp: 'exp',
      max_fert_exp: 'fert',
      max_profit: 'profit',
      max_fert_profit: 'fert_profit'
    }
    const sortBy = analyticsSortMap[strategy]
    if (sortBy) {
      try {
        const rankings = this.analytics.getPlantRankings(sortBy)
        const byId = new Map(available.map(item => [item.seedId, item]))
        for (const row of rankings) {
          const sid = Number(row?.seedId) || 0
          if (sid <= 0)
            continue
          if (Number.isFinite(row?.level) && row.level > state.level)
            continue
          const found = byId.get(sid)
          if (found)
            return found
        }
      } catch {}
    }

    if (strategy === 'preferred') {
      const preferred = this.accountConfig.getPreferredSeed(this.accountId)
      if (preferred > 0) {
        const found = available.find(item => item.seedId === preferred)
        if (found)
          return found
      }
    }

    available.sort((a, b) => b.requiredLevel - a.requiredLevel)
    return available[0]
  }
}
