import type { StoreService } from '../../store/store.service'
import type { GameConfigService } from '../game-config.service'
import type { IGameTransport } from '../interfaces/game-transport.interface'
import type { StatsTracker } from './stats.worker'
import { Logger } from '@nestjs/common'
import { Scheduler } from '@qq-farm/shared'
import { getCurrentPhase } from '../client-driven/helpers/land.helpers'
import { OP_TYPE_NAMES, PHASE_NAMES, PlantPhase } from '../constants'
import { getServerTimeSec, RE_TIME_HH_MM, sleep, toNum, toTimeSec } from '../utils'

function buildLandMap(lands: any[]): Map<number, any> {
  const map = new Map<number, any>()
  for (const land of lands || []) {
    const id = toNum(land?.id)
    if (id > 0)
      map.set(id, land)
  }
  return map
}

function getSlaveLandIds(land: any): number[] {
  const ids: any[] = Array.isArray(land?.slave_land_ids) ? land.slave_land_ids : []
  return [...new Set(ids.map(id => toNum(id)).filter(n => Number.isFinite(n) && n > 0))] as number[]
}

function hasPlantData(land: any): boolean {
  const plant = land?.plant
  return !!(plant && Array.isArray(plant.phases) && plant.phases.length > 0)
}

function getLinkedMasterLand(land: any, landsMap: Map<number, any>): any | null {
  const landId = toNum(land?.id)
  const masterLandId = toNum(land?.master_land_id)
  if (!masterLandId || masterLandId === landId)
    return null

  const masterLand = landsMap.get(masterLandId)
  if (!masterLand)
    return null

  const slaveIds = getSlaveLandIds(masterLand)
  if (slaveIds.length > 0 && !slaveIds.includes(landId))
    return null

  return masterLand
}

function getDisplayLandContext(land: any, landsMap: Map<number, any>): {
  sourceLand: any
  occupiedByMaster: boolean
  masterLandId: number
  occupiedLandIds: number[]
} {
  const masterLand = getLinkedMasterLand(land, landsMap)
  if (masterLand && hasPlantData(masterLand)) {
    const masterId = toNum(masterLand.id)
    const slaveIds = getSlaveLandIds(masterLand)
    const occupiedIds = [masterId, ...slaveIds].filter(Boolean)
    return {
      sourceLand: masterLand,
      occupiedByMaster: true,
      masterLandId: masterId,
      occupiedLandIds: occupiedIds.length > 0 ? occupiedIds : [masterId]
    }
  }

  const selfId = toNum(land?.id)
  const slaveIds = getSlaveLandIds(land)
  const occupiedIds = [selfId, ...slaveIds].filter(Boolean)
  return {
    sourceLand: land,
    occupiedByMaster: false,
    masterLandId: selfId,
    occupiedLandIds: occupiedIds.length > 0 ? occupiedIds : [selfId]
  }
}

function isOccupiedSlaveLand(land: any, landsMap: Map<number, any>): boolean {
  return getDisplayLandContext(land, landsMap).occupiedByMaster
}

export class FriendWorker {
  private logger: Logger
  private isChecking = false
  private loopRunning = false
  private externalScheduler = false
  private lastResetDate = ''
  private operationLimits = new Map<number, { dayTimes: number, dayTimesLimit: number, dayExpTimes: number, dayExpTimesLimit: number }>()
  private canGetHelpExp = true
  private helpAutoDisabledByLimit = false
  private scheduler: Scheduler
  onLog: ((entry: { msg: string, tag?: string, meta?: Record<string, string>, isWarn?: boolean }) => void) | null = null

  private readonly interactRpcCandidates: Array<[string, string]> = [
    ['gamepb.interactpb.InteractService', 'InteractRecords'],
    ['gamepb.interactpb.InteractService', 'GetInteractRecords'],
    ['gamepb.interactpb.VisitorService', 'InteractRecords'],
    ['gamepb.interactpb.VisitorService', 'GetInteractRecords']
  ]

  constructor(
    private accountId: string,
    private client: IGameTransport,
    private gameConfig: GameConfigService,
    private store: StoreService,
    private stats: StatsTracker,
    private sellAllFruits: () => Promise<number | void>,
    private platform: string
  ) {
    this.logger = new Logger(`Friend:${accountId}`)
    this.scheduler = new Scheduler(`friend-${accountId}`, this.logger)
  }

  private log(msg: string, event?: string) {
    this.logger.log(msg)
    this.onLog?.({ msg, tag: '好友', meta: { module: 'friend', ...(event && { event }) }, isWarn: false })
  }

  private warn(msg: string, event?: string) {
    this.logger.warn(msg)
    this.onLog?.({ msg, tag: '好友', meta: { module: 'friend', ...(event && { event }) }, isWarn: true })
  }

  // ========== Operation Limits ==========

  updateOperationLimits(limits: any[]) {
    if (!limits?.length)
      return
    this.checkDailyReset()
    for (const limit of limits) {
      const id = toNum(limit.id)
      if (id > 0) {
        this.operationLimits.set(id, {
          dayTimes: toNum(limit.day_times),
          dayTimesLimit: toNum(limit.day_times_lt),
          dayExpTimes: toNum(limit.day_exp_times),
          dayExpTimesLimit: toNum(limit.day_ex_times_lt)
        })
      }
    }
  }

  private checkDailyReset() {
    const nowSec = getServerTimeSec()
    const nowMs = nowSec > 0 ? nowSec * 1000 : Date.now()
    const bjOffset = 8 * 3600 * 1000
    const bjDate = new Date(nowMs + bjOffset)
    const today = `${bjDate.getUTCFullYear()}-${String(bjDate.getUTCMonth() + 1).padStart(2, '0')}-${String(bjDate.getUTCDate()).padStart(2, '0')}`
    if (this.lastResetDate !== today) {
      if (this.lastResetDate !== '')
        this.log('跨日重置，清空操作限制缓存', 'friend_cycle')
      this.operationLimits.clear()
      this.canGetHelpExp = true
      if (this.helpAutoDisabledByLimit) {
        this.helpAutoDisabledByLimit = false
        this.log('新的一天已开始，自动恢复帮忙操作功能', 'friend_cycle')
      }
      this.lastResetDate = today
    }
  }

  private canGetExp(opId: number): boolean {
    const limit = this.operationLimits.get(opId)
    if (!limit)
      return false
    if (limit.dayExpTimesLimit <= 0)
      return true
    return limit.dayExpTimes < limit.dayExpTimesLimit
  }

  private canGetExpByCandidates(opIds: number[]): boolean {
    return opIds.some(id => this.canGetExp(toNum(id)))
  }

  private canOperate(opId: number): boolean {
    const limit = this.operationLimits.get(opId)
    if (!limit)
      return true
    if (limit.dayTimesLimit <= 0)
      return true
    return limit.dayTimes < limit.dayTimesLimit
  }

  private getRemainingTimes(opId: number): number {
    const limit = this.operationLimits.get(opId)
    if (!limit || limit.dayTimesLimit <= 0)
      return 999
    return Math.max(0, limit.dayTimesLimit - limit.dayTimes)
  }

  getOperationLimits(): Record<number, any> {
    const result: Record<number, any> = {}
    for (const id of [10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008]) {
      const limit = this.operationLimits.get(id)
      if (limit) {
        result[id] = { name: OP_TYPE_NAMES[id] || `#${id}`, ...limit, remaining: this.getRemainingTimes(id) }
      }
    }
    return result
  }

  // ========== API ==========

  async getAllFriends(): Promise<any> {
    if (this.platform === 'qq') {
      const { data } = await this.client.invoke('gamepb.friendpb.FriendService', 'SyncAll', { open_ids: [] })
      return data ?? {}
    }
    const { data } = await this.client.invoke('gamepb.friendpb.FriendService', 'GetAll', {})
    return data ?? {}
  }

  async getApplications(): Promise<any> {
    const { data } = await this.client.invoke('gamepb.friendpb.FriendService', 'GetApplications', {})
    return data ?? {}
  }

  async acceptFriends(gids: number[]): Promise<any> {
    const { data } = await this.client.invoke('gamepb.friendpb.FriendService', 'AcceptFriends', { friend_gids: gids })
    return data ?? {}
  }

  async enterFriendFarm(friendGid: number): Promise<any> {
    const { data } = await this.client.invoke('gamepb.visitpb.VisitService', 'Enter', { host_gid: friendGid, reason: 2 })
    return data ?? {}
  }

  async leaveFriendFarm(friendGid: number) {
    try {
      await this.client.invoke('gamepb.visitpb.VisitService', 'Leave', { host_gid: friendGid })
    } catch {}
  }

  private async helpAction(gid: number, landIds: any[], method: string, stopWhenExpLimit = false) {
    const beforeExp = toNum(this.client.userState?.exp)
    const { data: reply } = await this.client.invoke<any>('gamepb.plantpb.PlantService', method, { land_ids: landIds, host_gid: gid })
    if ((reply as any)?.operation_limits)
      this.updateOperationLimits((reply as any).operation_limits)
    if (stopWhenExpLimit) {
      await sleep(200)
      const afterExp = toNum(this.client.userState?.exp)
      if (afterExp <= beforeExp)
        this.autoDisableHelpByExpLimit()
    }
    return reply ?? {}
  }

  async helpWater(gid: number, landIds: any[], stopWhenExpLimit = false) {
    return this.helpAction(gid, landIds, 'WaterLand', stopWhenExpLimit)
  }

  async helpWeed(gid: number, landIds: any[], stopWhenExpLimit = false) {
    return this.helpAction(gid, landIds, 'WeedOut', stopWhenExpLimit)
  }

  async helpInsecticide(gid: number, landIds: any[], stopWhenExpLimit = false) {
    return this.helpAction(gid, landIds, 'Insecticide', stopWhenExpLimit)
  }

  async stealHarvest(friendGid: number, landIds: any[]): Promise<any> {
    const { data: reply } = await this.client.invoke<any>('gamepb.plantpb.PlantService', 'Harvest', { land_ids: landIds, host_gid: friendGid, is_all: true })
    if ((reply as any)?.operation_limits)
      this.updateOperationLimits((reply as any).operation_limits)
    return reply ?? {}
  }

  private async putPlantItems(friendGid: number, landIds: number[], method: string): Promise<number> {
    let ok = 0
    for (const landId of landIds) {
      try {
        const { data: reply } = await this.client.invoke<any>('gamepb.plantpb.PlantService', method, { land_ids: [landId], host_gid: friendGid })
        if ((reply as any)?.operation_limits)
          this.updateOperationLimits((reply as any).operation_limits)
        ok++
      } catch {}
      await sleep(100)
    }
    return ok
  }

  private async putPlantItemsDetailed(friendGid: number, landIds: number[], method: string) {
    let ok = 0
    const failed: { landId: number, reason: string }[] = []
    for (const landId of landIds) {
      try {
        const { data: reply } = await this.client.invoke<any>('gamepb.plantpb.PlantService', method, { land_ids: [landId], host_gid: friendGid })
        if ((reply as any)?.operation_limits)
          this.updateOperationLimits((reply as any).operation_limits)
        ok++
      } catch (e: any) { failed.push({ landId, reason: e?.message || '未知错误' }) }
      await sleep(100)
    }
    return { ok, failed }
  }

  async putInsects(gid: number, landIds: number[]) { return this.putPlantItems(gid, landIds, 'PutInsects') }
  async putWeeds(gid: number, landIds: number[]) { return this.putPlantItems(gid, landIds, 'PutWeeds') }
  async putInsectsDetailed(gid: number, landIds: number[]) { return this.putPlantItemsDetailed(gid, landIds, 'PutInsects') }
  async putWeedsDetailed(gid: number, landIds: number[]) { return this.putPlantItemsDetailed(gid, landIds, 'PutWeeds') }

  async checkCanOperateRemote(friendGid: number, operationId: number) {
    try {
      const { data: reply } = await this.client.invoke<any>('gamepb.plantpb.PlantService', 'CheckCanOperate', { host_gid: friendGid, operation_id: operationId })
      return { canOperate: !!(reply as any)?.can_operate, canStealNum: toNum((reply as any)?.can_steal_num) }
    } catch { return { canOperate: true, canStealNum: 0 } }
  }

  private autoDisableHelpByExpLimit() {
    if (!this.canGetHelpExp)
      return
    this.canGetHelpExp = false
    this.helpAutoDisabledByLimit = true
    this.log('今日帮助经验已达上限，自动停止帮忙', 'friend_cycle')
  }

  // ========== Land Analysis ==========

  analyzeFriendLands(lands: any[], myGid: number) {
    const result: Record<string, number[]> & { stealableInfo: any[] } = {
      stealable: [],
      stealableInfo: [],
      needWater: [],
      needWeed: [],
      needBug: [],
      canPutWeed: [],
      canPutBug: []
    }
    const landsMap = buildLandMap(lands)
    for (const land of lands) {
      const id = toNum(land.id)
      if (isOccupiedSlaveLand(land, landsMap))
        continue
      const plant = land.plant
      if (!plant?.phases?.length)
        continue
      const phase = getCurrentPhase(plant.phases)
      if (!phase)
        continue
      const phaseVal = phase.phase
      if (phaseVal === PlantPhase.MATURE) {
        if (plant.stealable) {
          result.stealable.push(id)
          result.stealableInfo.push({ landId: id, plantId: toNum(plant.id), name: this.gameConfig.getPlantName(toNum(plant.id)) || plant.name || '未知' })
        }
        continue
      }
      if (phaseVal === PlantPhase.DEAD)
        continue
      if (toNum(plant.dry_num) > 0)
        result.needWater.push(id)
      if (plant.weed_owners?.length > 0)
        result.needWeed.push(id)
      if (plant.insect_owners?.length > 0)
        result.needBug.push(id)
      const weedOwners = plant.weed_owners || []
      const insectOwners = plant.insect_owners || []
      if (weedOwners.length < 2 && !weedOwners.some((gid: any) => toNum(gid) === myGid))
        result.canPutWeed.push(id)
      if (insectOwners.length < 2 && !insectOwners.some((gid: any) => toNum(gid) === myGid))
        result.canPutBug.push(id)
    }
    return result
  }

  // ========== Quiet Hours ==========

  private inFriendQuietHours(): boolean {
    const cfg = this.store.getFriendQuietHours(this.accountId)
    if (!cfg?.enabled)
      return false
    const parseTime = (s: string) => {
      const m = String(s || '').match(RE_TIME_HH_MM)
      if (!m)
        return null
      const h = Number.parseInt(m[1], 10)
      const min = Number.parseInt(m[2], 10)
      return (h >= 0 && h <= 23 && min >= 0 && min <= 59) ? h * 60 + min : null
    }
    const start = parseTime(cfg.start)
    const end = parseTime(cfg.end)
    if (start === null || end === null)
      return false
    const cur = new Date().getHours() * 60 + new Date().getMinutes()
    if (start === end)
      return true
    return start < end ? (cur >= start && cur < end) : (cur >= start || cur < end)
  }

  // ========== Public API ==========

  async getFriendsList() {
    try {
      const reply = await this.getAllFriends()
      const friends = reply.game_friends || []
      const myGid = this.client.userState.gid
      return friends
        .filter((f: any) => toNum(f.gid) !== myGid && f.name !== '小小农夫' && f.remark !== '小小农夫')
        .map((f: any) => ({
          gid: toNum(f.gid),
          name: f.remark || f.name || `GID:${toNum(f.gid)}`,
          avatarUrl: String(f.avatar_url || '').trim(),
          level: toNum(f.level),
          plant: f.plant ? { stealNum: toNum(f.plant.steal_plant_num), dryNum: toNum(f.plant.dry_num), weedNum: toNum(f.plant.weed_num), insectNum: toNum(f.plant.insect_num) } : null
        }))
        .sort((a: any, b: any) => {
          const r = String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
          return r !== 0 ? r : (a.gid - b.gid)
        })
    } catch { return [] }
  }

  private getInteractActionLabel(actionType: number): string {
    if (actionType === 1)
      return '偷取作物'
    if (actionType === 2)
      return '帮忙'
    if (actionType === 3)
      return '捣乱'
    return '互动'
  }

  private buildInteractActionDetail(record: {
    actionType: number
    cropName?: string
    cropCount?: number
    times?: number
    landId?: number
  }): string {
    const count = Number(record.cropCount) || 0
    const times = Number(record.times) || 0
    const landId = Number(record.landId) || 0
    const parts: string[] = []

    if (record.actionType === 1) {
      if (record.cropName && count > 0)
        parts.push(`偷取 ${record.cropName} × ${count}`)
      else if (record.cropName)
        parts.push(`偷取 ${record.cropName}`)
      else if (count > 0)
        parts.push(`偷取作物 × ${count}`)
      else
        parts.push('偷取作物')
    } else if (record.actionType === 2) {
      parts.push(times > 1 ? `帮忙 ${times} 次` : '帮忙')
    } else if (record.actionType === 3) {
      parts.push(times > 1 ? `捣乱 ${times} 次` : '捣乱')
    } else {
      parts.push(times > 1 ? `互动 ${times} 次` : '互动')
    }

    if (landId > 0)
      parts.push(`地块 ${landId}`)
    return parts.join(' · ')
  }

  private resolveInteractCropName(cropId: number): string {
    const id = Number(cropId) || 0
    if (id <= 0)
      return ''
    if (this.gameConfig.getPlantById(id))
      return this.gameConfig.getPlantName(id)
    if (this.gameConfig.getPlantByFruitId(id))
      return this.gameConfig.getFruitName(id)
    return ''
  }

  private normalizeInteractRecord(record: any, index: number) {
    const actionType = toNum(record && record.action_type)
    const visitorGid = toNum(record && record.visitor_gid)
    const cropId = toNum(record && record.crop_id)
    const cropCount = toNum(record && record.crop_count)
    const times = toNum(record && record.times)
    const level = toNum(record && record.level)
    const fromType = toNum(record && record.from_type)
    const serverTimeSec = toTimeSec(record && record.server_time)
    const extra = (record && record.extra) || {}
    const landId = toNum(extra.land_id)
    const flag1 = toNum(extra.flag1)
    const flag2 = toNum(extra.flag2)
    const cropName = this.resolveInteractCropName(cropId)
    const nick = String((record && record.nick) || '').trim() || `GID:${visitorGid}`
    const avatarUrl = String((record && record.avatar_url) || '').trim()

    const normalized: any = {
      key: `${serverTimeSec || 0}-${visitorGid || 0}-${actionType || 0}-${index}`,
      serverTimeSec,
      serverTimeMs: serverTimeSec > 0 ? serverTimeSec * 1000 : 0,
      actionType,
      actionLabel: this.getInteractActionLabel(actionType),
      visitorGid,
      nick,
      avatarUrl,
      cropId,
      cropName,
      cropCount,
      times,
      fromType,
      level,
      landId,
      flag1,
      flag2
    }

    normalized.actionDetail = this.buildInteractActionDetail(normalized)
    return normalized
  }

  async getInteractRecords() {
    const errors: string[] = []
    for (const [serviceName, methodName] of this.interactRpcCandidates) {
      try {
        const { data: reply } = await this.client.invoke<any>(serviceName, methodName, {}, 2500)
        const records = Array.isArray(reply?.records) ? reply.records : []
        return records
          .map((r, index) => this.normalizeInteractRecord(r, index))
          .sort((a, b) => (b.serverTimeSec - a.serverTimeSec) || (b.visitorGid - a.visitorGid) || (b.actionType - a.actionType))
      } catch (e: any) {
        const msg = e?.message || String(e || 'unknown')
        errors.push(`${serviceName}.${methodName}: ${msg}`)
      }
    }

    this.warn(`访客记录接口调用失败: ${errors.join(' | ')}`, 'interact_records')
    throw new Error('访客记录接口调用失败，请确认服务名和方法名是否与当前版本一致')
  }

  async getFriendLandsDetail(friendGid: number) {
    try {
      const enterReply = await this.enterFriendFarm(friendGid)
      const lands = enterReply.lands || []
      const analyzed = this.analyzeFriendLands(lands, this.client.userState.gid)
      await this.leaveFriendFarm(friendGid)

      if (analyzed.stealable.length > 0) {
        const pre = await this.checkCanOperateRemote(friendGid, 10008)
        if (!pre.canOperate) {
          analyzed.stealable = []
          analyzed.stealableInfo = []
        }
      }

      const nowSec = getServerTimeSec()
      const landsMap = buildLandMap(lands)
      const landsList = lands.map((land: any) => {
        const id = toNum(land.id)
        if (!land.unlocked) {
          return {
            id,
            unlocked: false,
            status: 'locked',
            plantName: '',
            phaseName: '未解锁',
            level: toNum(land.level),
            occupiedByMaster: false,
            masterLandId: id,
            occupiedLandIds: [id],
            plantSize: 1
          }
        }

        const context = getDisplayLandContext(land, landsMap)
        const sourceLand = context.sourceLand
        const plant = sourceLand?.plant
        if (!plant?.phases?.length) {
          return {
            id,
            unlocked: true,
            status: 'empty',
            plantName: '',
            phaseName: '空地',
            level: toNum(land.level),
            occupiedByMaster: context.occupiedByMaster,
            masterLandId: context.masterLandId,
            occupiedLandIds: context.occupiedLandIds,
            plantSize: 1
          }
        }

        const phase = getCurrentPhase(plant.phases)
        if (!phase) {
          return {
            id,
            unlocked: true,
            status: 'empty',
            plantName: '',
            phaseName: '',
            level: toNum(land.level),
            occupiedByMaster: context.occupiedByMaster,
            masterLandId: context.masterLandId,
            occupiedLandIds: context.occupiedLandIds,
            plantSize: 1
          }
        }

        const plantId = toNum(plant.id)
        const plantCfg = this.gameConfig.getPlantById(plantId)
        const seedId = toNum(plantCfg?.seed_id)
        const totalSeasons = Number((plantCfg as any)?.seasons) || 1
        const currentSeason = Number((plant as any)?.cur_season) || 1
        const maturePhase = plant.phases.find((p: any) => toNum(p?.phase) === PlantPhase.MATURE)
        const matureBegin = maturePhase ? toTimeSec(maturePhase.begin_time) : 0
        const plantSize = Math.max(1, Number((plantCfg as any)?.size) || 1)

        let status = 'growing'
        if (phase.phase === PlantPhase.MATURE)
          status = plant.stealable ? 'stealable' : 'harvested'
        else if (phase.phase === PlantPhase.DEAD)
          status = 'dead'

        return {
          id,
          unlocked: true,
          status,
          plantName: this.gameConfig.getPlantName(plantId),
          seedId,
          seedImage: seedId > 0 ? this.gameConfig.getSeedImageBySeedId(seedId) : '',
          phaseName: PHASE_NAMES[phase.phase as number] ?? '',
          level: toNum(land.level),
          matureInSec: matureBegin > nowSec ? matureBegin - nowSec : 0,
          needWater: toNum(plant.dry_num) > 0,
          needWeed: plant.weed_owners?.length > 0,
          needBug: plant.insect_owners?.length > 0,
          currentSeason,
          totalSeasons,
          occupiedByMaster: context.occupiedByMaster,
          masterLandId: context.masterLandId,
          occupiedLandIds: context.occupiedLandIds,
          plantSize
        }
      })
      return { lands: landsList, summary: analyzed }
    } catch { return { lands: [], summary: {} } }
  }

  // ========== Batch Helpers ==========

  private async runBatchWithFallback(ids: number[], batchFn: (ids: number[]) => Promise<any>, singleFn: (ids: number[]) => Promise<any>): Promise<number> {
    const target = ids.filter(Boolean)
    if (!target.length)
      return 0
    try {
      await batchFn(target)
      return target.length
    } catch {
      let ok = 0
      for (const landId of target) {
        try {
          await singleFn([landId])
          ok++
        } catch {}
        await sleep(100)
      }
      return ok
    }
  }

  // ========== Manual Operation ==========

  private buildFriendOpHandlers(): Record<string, (status: ReturnType<FriendWorker['analyzeFriendLands']>, gid: number) => Promise<{ ok: boolean, opType: string, count?: number, message: string, bugCount?: number, weedCount?: number }>> {
    return {
      steal: async (status, gid) => {
        if (!status.stealable.length)
          return { ok: true, opType: 'steal', count: 0, message: '没有可偷取土地' }
        const pre = await this.checkCanOperateRemote(gid, 10008)
        if (!pre.canOperate)
          return { ok: true, opType: 'steal', count: 0, message: '今日偷菜次数已用完' }
        const target = status.stealable.slice(0, pre.canStealNum > 0 ? pre.canStealNum : status.stealable.length)
        const count = await this.runBatchWithFallback(target, ids => this.stealHarvest(gid, ids), ids => this.stealHarvest(gid, ids))
        if (count > 0) {
          this.stats.recordOperation('steal', count)
          await this.sellAllFruits()
        }
        return { ok: true, opType: 'steal', count, message: `偷取完成 ${count} 块` }
      },
      water: async (status, gid) => {
        if (!status.needWater.length)
          return { ok: true, opType: 'water', count: 0, message: '没有可浇水土地' }
        const pre = await this.checkCanOperateRemote(gid, 10007)
        if (!pre.canOperate)
          return { ok: true, opType: 'water', count: 0, message: '今日浇水次数已用完' }
        const count = await this.runBatchWithFallback(status.needWater, ids => this.helpWater(gid, ids), ids => this.helpWater(gid, ids))
        if (count > 0)
          this.stats.recordOperation('helpWater', count)
        return { ok: true, opType: 'water', count, message: `浇水完成 ${count} 块` }
      },
      weed: async (status, gid) => {
        if (!status.needWeed.length)
          return { ok: true, opType: 'weed', count: 0, message: '没有可除草土地' }
        const pre = await this.checkCanOperateRemote(gid, 10005)
        if (!pre.canOperate)
          return { ok: true, opType: 'weed', count: 0, message: '今日除草次数已用完' }
        const count = await this.runBatchWithFallback(status.needWeed, ids => this.helpWeed(gid, ids), ids => this.helpWeed(gid, ids))
        if (count > 0)
          this.stats.recordOperation('helpWeed', count)
        return { ok: true, opType: 'weed', count, message: `除草完成 ${count} 块` }
      },
      bug: async (status, gid) => {
        if (!status.needBug.length)
          return { ok: true, opType: 'bug', count: 0, message: '没有可除虫土地' }
        const pre = await this.checkCanOperateRemote(gid, 10006)
        if (!pre.canOperate)
          return { ok: true, opType: 'bug', count: 0, message: '今日除虫次数已用完' }
        const count = await this.runBatchWithFallback(status.needBug, ids => this.helpInsecticide(gid, ids), ids => this.helpInsecticide(gid, ids))
        if (count > 0)
          this.stats.recordOperation('helpBug', count)
        return { ok: true, opType: 'bug', count, message: `除虫完成 ${count} 块` }
      },
      bad: async (status, gid) => {
        let bugCount = 0
        let weedCount = 0
        if (!status.canPutBug.length && !status.canPutWeed.length)
          return { ok: true, opType: 'bad', count: 0, bugCount: 0, weedCount: 0, message: '没有可捣乱土地' }
        const failDetails: string[] = []
        if (status.canPutBug.length) {
          const r = await this.putInsectsDetailed(gid, status.canPutBug)
          bugCount = r.ok
          failDetails.push(...(r.failed || []).map(f => `放虫#${f.landId}:${f.reason}`))
          if (bugCount > 0)
            this.stats.recordOperation('bug', bugCount)
        }
        if (status.canPutWeed.length) {
          const r = await this.putWeedsDetailed(gid, status.canPutWeed)
          weedCount = r.ok
          failDetails.push(...(r.failed || []).map(f => `放草#${f.landId}:${f.reason}`))
          if (weedCount > 0)
            this.stats.recordOperation('weed', weedCount)
        }
        const count = bugCount + weedCount
        if (count <= 0)
          return { ok: true, opType: 'bad', count: 0, bugCount, weedCount, message: failDetails.slice(0, 2).join(' | ') || '捣乱失败或今日次数已用完' }
        return { ok: true, opType: 'bad', count, bugCount, weedCount, message: `捣乱完成 虫${bugCount}/草${weedCount}` }
      }
    }
  }

  private friendOpHandlers = this.buildFriendOpHandlers()

  async doFriendOperation(friendGid: number, opType: string) {
    const gid = toNum(friendGid)
    if (!gid)
      return { ok: false, message: '无效好友ID', opType }

    let enterReply: any
    try {
      enterReply = await this.enterFriendFarm(gid)
    } catch (e: any) {
      return { ok: false, message: `进入好友农场失败: ${e?.message}`, opType }
    }

    try {
      const lands = enterReply.lands || []
      const status = this.analyzeFriendLands(lands, this.client.userState.gid)
      const handler = this.friendOpHandlers[opType]
      if (!handler)
        return { ok: false, opType, count: 0, message: '未知操作类型' }
      return await handler(status, gid)
    } catch (e: any) {
      return { ok: false, opType, count: 0, message: e?.message || '操作失败' }
    } finally {
      try {
        await this.leaveFriendFarm(gid)
      } catch {}
    }
  }

  // ========== Auto Visit ==========

  private async visitFriend(friend: { gid: number, name: string }, totalActions: Record<string, number>) {
    const { gid, name } = friend
    let enterReply: any
    try {
      enterReply = await this.enterFriendFarm(gid)
    } catch (e: any) {
      this.warn(`进入 ${name} 农场失败: ${e?.message}`, 'visit_friend')
      return
    }

    const lands = enterReply.lands || []
    if (!lands.length) {
      await this.leaveFriendFarm(gid)
      return
    }

    const myGid = this.client.userState.gid
    const status = this.analyzeFriendLands(lands, myGid)

    const stealBlacklist = new Set(this.store.getStealCropBlacklist(this.accountId))
    if (stealBlacklist.size > 0) {
      status.stealableInfo = status.stealableInfo.filter((info: any) => {
        const plant = this.gameConfig.getPlantById(info.plantId)
        if (!plant?.seed_id)
          return true
        return !stealBlacklist.has(plant.seed_id)
      })
      status.stealable = status.stealableInfo.map((x: any) => x.landId)
    }

    const actions: string[] = []
    const helpEnabled = this.store.isAutomationOn('friend_help', this.accountId)
    const stopWhenExpLimit = this.store.isAutomationOn('friend_help_exp_limit', this.accountId)
    if (!stopWhenExpLimit)
      this.canGetHelpExp = true

    if (helpEnabled && !(stopWhenExpLimit && !this.canGetHelpExp)) {
      const helpOps = [
        { id: 10005, expIds: [10005, 10003], list: status.needWeed, fn: (g: number, ids: any[], s: boolean) => this.helpWeed(g, ids, s), key: 'weed', name: '草', record: 'helpWeed' },
        { id: 10006, expIds: [10006, 10002], list: status.needBug, fn: (g: number, ids: any[], s: boolean) => this.helpInsecticide(g, ids, s), key: 'bug', name: '虫', record: 'helpBug' },
        { id: 10007, expIds: [10007, 10001], list: status.needWater, fn: (g: number, ids: any[], s: boolean) => this.helpWater(g, ids, s), key: 'water', name: '水', record: 'helpWater' }
      ]
      for (const op of helpOps) {
        const allowByExp = !stopWhenExpLimit || (this.canGetExpByCandidates(op.expIds) && this.canGetHelpExp)
        if (op.list.length > 0 && allowByExp) {
          const pre = await this.checkCanOperateRemote(gid, op.id)
          if (pre.canOperate) {
            const count = await this.runBatchWithFallback(op.list, ids => op.fn(gid, ids, stopWhenExpLimit), ids => op.fn(gid, ids, stopWhenExpLimit))
            if (count > 0) {
              actions.push(`${op.name}${count}`)
              totalActions[op.key] += count
              this.stats.recordOperation(op.record, count)
            }
          }
        }
      }
    }

    if (this.store.isAutomationOn('friend_steal', this.accountId) && status.stealable.length > 0) {
      const pre = await this.checkCanOperateRemote(gid, 10008)
      if (pre.canOperate) {
        const maxNum = pre.canStealNum > 0 ? pre.canStealNum : status.stealable.length
        const target = status.stealable.slice(0, maxNum)
        let ok = 0
        const stolenPlants: string[] = []
        try {
          await this.stealHarvest(gid, target)
          ok = target.length
          target.forEach((id: number) => {
            const info = status.stealableInfo.find((x: any) => x.landId === id)
            if (info)
              stolenPlants.push(info.name)
          })
        } catch {
          for (const landId of target) {
            try {
              await this.stealHarvest(gid, [landId])
              ok++
              const info = status.stealableInfo.find((x: any) => x.landId === landId)
              if (info)
                stolenPlants.push(info.name)
            } catch {}
            await sleep(100)
          }
        }
        if (ok > 0) {
          const plantNames = [...new Set(stolenPlants)].join('/')
          actions.push(`偷${ok}${plantNames ? `(${plantNames})` : ''}`)
          totalActions.steal += ok
          this.stats.recordOperation('steal', ok)
        }
      }
    }

    if (this.store.isAutomationOn('friend_bad', this.accountId)) {
      if (status.canPutBug.length > 0 && this.canOperate(10004)) {
        const remaining = this.getRemainingTimes(10004)
        const ok = await this.putInsects(gid, status.canPutBug.slice(0, remaining))
        if (ok > 0) {
          actions.push(`放虫${ok}`)
          totalActions.putBug += ok
        }
      }
      if (status.canPutWeed.length > 0 && this.canOperate(10003)) {
        const remaining = this.getRemainingTimes(10003)
        const ok = await this.putWeeds(gid, status.canPutWeed.slice(0, remaining))
        if (ok > 0) {
          actions.push(`放草${ok}`)
          totalActions.putWeed += ok
        }
      }
    }

    if (actions.length > 0)
      this.log(`${name}: ${actions.join('/')}`, 'visit_friend')
    await this.leaveFriendFarm(gid)
  }

  // ========== Friend Loop ==========

  async checkFriends(): Promise<boolean> {
    if (!this.store.isAutomationOn('friend', this.accountId))
      return false
    const helpOn = this.store.isAutomationOn('friend_help', this.accountId)
    const stealOn = this.store.isAutomationOn('friend_steal', this.accountId)
    const badOn = this.store.isAutomationOn('friend_bad', this.accountId)
    if (this.isChecking || !this.client.userState.gid || !(helpOn || stealOn || badOn))
      return false
    if (this.inFriendQuietHours())
      return false

    this.isChecking = true
    this.checkDailyReset()

    try {
      const reply = await this.getAllFriends()
      const friends = reply.game_friends || []
      if (!friends.length) {
        this.log('没有好友', 'friend_cycle')
        return false
      }

      const myGid = this.client.userState.gid
      const blacklist = new Set(this.store.getFriendBlacklist(this.accountId))
      const canPutBugOrWeed = this.canOperate(10004) || this.canOperate(10003)
      const priority: any[] = []
      const others: any[] = []
      const visited = new Set<number>()

      for (const f of friends) {
        const gid = toNum(f.gid)
        if (gid === myGid || visited.has(gid) || blacklist.has(gid))
          continue
        const name = f.remark || f.name || `GID:${gid}`
        const p = f.plant
        const stealNum = p ? toNum(p.steal_plant_num) : 0
        const dryNum = p ? toNum(p.dry_num) : 0
        const weedNum = p ? toNum(p.weed_num) : 0
        const insectNum = p ? toNum(p.insect_num) : 0
        const hasAction = stealNum > 0 || dryNum > 0 || weedNum > 0 || insectNum > 0
        if (hasAction) {
          priority.push({ gid, name, isPriority: true, stealNum, dryNum, weedNum, insectNum })
          visited.add(gid)
        } else if ((badOn && canPutBugOrWeed) || helpOn || stealOn) {
          others.push({ gid, name, isPriority: false })
          visited.add(gid)
        }
      }

      priority.sort((a, b) => {
        if (b.stealNum !== a.stealNum)
          return b.stealNum - a.stealNum
        return (b.dryNum + b.weedNum + b.insectNum) - (a.dryNum + a.weedNum + a.insectNum)
      })
      const toVisit = [...priority, ...others]
      if (!toVisit.length)
        return false

      const totalActions: Record<string, number> = { steal: 0, water: 0, weed: 0, bug: 0, putBug: 0, putWeed: 0 }
      for (const friend of toVisit) {
        if (!friend.isPriority && !helpOn && !stealOn && !this.canOperate(10004) && !this.canOperate(10003))
          break
        try {
          await this.visitFriend(friend, totalActions)
        } catch {}
        await sleep(200)
      }

      if (totalActions.steal > 0) {
        await this.sellAllFruits()
      }

      const summary: string[] = []
      if (totalActions.steal > 0)
        summary.push(`偷${totalActions.steal}`)
      if (totalActions.weed > 0)
        summary.push(`除草${totalActions.weed}`)
      if (totalActions.bug > 0)
        summary.push(`除虫${totalActions.bug}`)
      if (totalActions.water > 0)
        summary.push(`浇水${totalActions.water}`)
      if (totalActions.putBug > 0)
        summary.push(`放虫${totalActions.putBug}`)
      if (totalActions.putWeed > 0)
        summary.push(`放草${totalActions.putWeed}`)

      if (summary.length > 0)
        this.log(`巡查 ${toVisit.length} 人 → ${summary.join('/')}`, 'friend_cycle')
      return summary.length > 0
    } catch (e: any) {
      this.warn(`巡查异常: ${e?.message}`, 'friend_cycle')
      return false
    } finally {
      this.isChecking = false
    }
  }

  startFriendLoop(options: { externalScheduler?: boolean } = {}) {
    if (this.loopRunning)
      return
    this.externalScheduler = !!options.externalScheduler
    this.loopRunning = true
    this.client.on('friendApplicationReceived', this.onFriendApplicationReceived)
    if (!this.externalScheduler)
      this.scheduler.setTimeoutTask('friend_check_loop', 5000, () => this.friendCheckLoop())
    this.scheduler.setTimeoutTask('friend_check_bootstrap_applications', 3000, () => this.checkAndAcceptApplications())
  }

  stopFriendLoop() {
    this.loopRunning = false
    this.externalScheduler = false
    this.client.removeListener('friendApplicationReceived', this.onFriendApplicationReceived)
    this.scheduler.clearAll()
  }

  refreshFriendLoop(delayMs = 200) {
    if (!this.loopRunning || this.externalScheduler)
      return
    this.scheduler.setTimeoutTask('friend_check_loop', Math.max(0, delayMs), () => this.friendCheckLoop())
  }

  private async friendCheckLoop() {
    if (this.externalScheduler || !this.loopRunning)
      return
    await this.checkFriends()
    if (this.loopRunning)
      this.scheduler.setTimeoutTask('friend_check_loop', 10_000, () => this.friendCheckLoop())
  }

  // ========== Friend Applications ==========

  private onFriendApplicationReceived = (applications: any[]) => {
    const names = applications.map((a: any) => a.name || `GID:${toNum(a.gid)}`).join(', ')
    this.log(`收到 ${applications.length} 个好友申请: ${names}`, 'friend_cycle')
    const gids = applications.map((a: any) => toNum(a.gid))
    this.acceptFriendsWithRetry(gids)
  }

  async checkAndAcceptApplications() {
    try {
      const reply = await this.getApplications()
      const apps = reply.applications || []
      if (!apps.length)
        return
      const names = apps.map((a: any) => a.name || `GID:${toNum(a.gid)}`).join(', ')
      this.log(`发现 ${apps.length} 个待处理申请: ${names}`, 'friend_cycle')
      await this.acceptFriendsWithRetry(apps.map((a: any) => toNum(a.gid)))
    } catch {}
  }

  private async acceptFriendsWithRetry(gids: number[]) {
    if (!gids.length)
      return
    try {
      const reply = await this.acceptFriends(gids)
      const friends = reply.friends || []
      if (friends.length > 0) {
        const names = friends.map((f: any) => f.name || f.remark || `GID:${toNum(f.gid)}`).join(', ')
        this.log(`已同意 ${friends.length} 人: ${names}`, 'friend_cycle')
      }
    } catch (e: any) { this.warn(`同意失败: ${e?.message}`, 'friend_cycle') }
  }

  destroy() {
    this.stopFriendLoop()
  }
}
