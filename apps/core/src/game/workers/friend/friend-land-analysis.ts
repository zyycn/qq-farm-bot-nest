import { PlantPhase } from '../../constants'
import { getCurrentPhase } from '../../session/helpers/land.helpers'
import { toNum } from '../../utils'

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

export interface FriendDisplayLandContext {
  sourceLand: any
  occupiedByMaster: boolean
  masterLandId: number
  occupiedLandIds: number[]
}

export function getDisplayLandContext(land: any, landsMap: Map<number, any>): FriendDisplayLandContext {
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

export function isOccupiedSlaveLand(land: any, landsMap: Map<number, any>): boolean {
  return getDisplayLandContext(land, landsMap).occupiedByMaster
}

export interface FriendLandAnalysis {
  stealable: number[]
  stealableInfo: any[]
  needWater: number[]
  needWeed: number[]
  needBug: number[]
  canPutWeed: number[]
  canPutBug: number[]
}

export interface FriendLandAnalyzerDeps {
  getPlantName: (plantId: number) => string
}

export class FriendLandAnalyzer {
  constructor(private readonly deps: FriendLandAnalyzerDeps) {}

  analyzeFriendLands(lands: any[], myGid: number): FriendLandAnalysis {
    const result: FriendLandAnalysis = {
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
          result.stealableInfo.push({ landId: id, plantId: toNum(plant.id), name: this.deps.getPlantName(toNum(plant.id)) || plant.name || '未知' })
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
}

export { buildLandMap }
