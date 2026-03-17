import type { GameConfigService } from '../../game-config.service'
import { PHASE_NAMES, PlantPhase } from '../../constants'
import { getServerTimeSec, toNum, toTimeSec } from '../../utils'

export interface OwnedLandStatus {
  harvestable: number[]
  harvestableInfo: Array<{ landId: number, plantId: number, name: string, exp: number }>
  needWater: number[]
  needWeed: number[]
  needBug: number[]
  growing: number[]
  empty: number[]
  dead: number[]
  unlockable: number[]
  upgradable: number[]
}

export function buildLandMap(lands: any[]): Map<number, any> {
  const map = new Map<number, any>()
  for (const land of lands || []) {
    const id = toNum(land?.id)
    if (id > 0)
      map.set(id, land)
  }
  return map
}

export function getSlaveLandIds(land: any): number[] {
  const ids: any[] = Array.isArray(land?.slave_land_ids) ? land.slave_land_ids : []
  return [...new Set(ids.map(id => toNum(id)).filter(n => Number.isFinite(n) && n > 0))]
}

export function hasPlantData(land: any): boolean {
  const plant = land?.plant
  return !!(plant && Array.isArray(plant.phases) && plant.phases.length > 0)
}

export function getLinkedMasterLand(land: any, landsMap: Map<number, any>): any | null {
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

export function getDisplayLandContext(land: any, landsMap: Map<number, any>): {
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

export function isOccupiedSlaveLand(land: any, landsMap: Map<number, any>): boolean {
  return getDisplayLandContext(land, landsMap).occupiedByMaster
}

export function getCurrentPhase(phases: any[], nowSec = getServerTimeSec()): any | null {
  if (!phases?.length)
    return null
  for (let i = phases.length - 1; i >= 0; i--) {
    const beginTime = toTimeSec(phases[i]?.begin_time)
    if (beginTime > 0 && beginTime <= nowSec)
      return phases[i]
  }
  return phases[0]
}

export function getMatureAtSec(phases: any[]): number {
  let matureAtSec = 0
  for (const phase of phases || []) {
    if (toNum(phase?.phase) !== PlantPhase.MATURE)
      continue
    const sec = toTimeSec(phase?.begin_time)
    if (sec > 0 && (matureAtSec === 0 || sec < matureAtSec))
      matureAtSec = sec
  }
  return matureAtSec
}

export function getIssueAtSec(plant: any, phase: any): { dryAt: number, weedAt: number, bugAt: number } {
  const dryAt = Math.max(toTimeSec(plant?.dry_time), toTimeSec(phase?.dry_time))
  const weedAt = Math.max(toTimeSec(plant?.weeds_time), toTimeSec(phase?.weeds_time))
  const bugAt = Math.max(toTimeSec(plant?.insect_time), toTimeSec(phase?.insect_time))
  return { dryAt, weedAt, bugAt }
}

export function createEmptyOwnedLandStatus(): OwnedLandStatus {
  return {
    harvestable: [],
    harvestableInfo: [],
    needWater: [],
    needWeed: [],
    needBug: [],
    growing: [],
    empty: [],
    dead: [],
    unlockable: [],
    upgradable: []
  }
}

export function analyzeOwnedLands(lands: any[], gameConfig: GameConfigService, nowSec = getServerTimeSec()): OwnedLandStatus {
  const result = createEmptyOwnedLandStatus()
  const landsMap = buildLandMap(lands)

  for (const land of lands || []) {
    const id = toNum(land?.id)
    if (isOccupiedSlaveLand(land, landsMap))
      continue

    if (!land?.unlocked) {
      if (land?.could_unlock)
        result.unlockable.push(id)
      continue
    }

    if (land?.could_upgrade)
      result.upgradable.push(id)

    const plant = land?.plant
    if (!plant?.phases?.length) {
      result.empty.push(id)
      continue
    }

    const phase = getCurrentPhase(plant.phases, nowSec)
    if (!phase) {
      result.empty.push(id)
      continue
    }

    const phaseVal = toNum(phase?.phase)
    if (phaseVal === PlantPhase.DEAD) {
      result.dead.push(id)
      continue
    }

    if (phaseVal === PlantPhase.MATURE) {
      result.harvestable.push(id)
      result.harvestableInfo.push({
        landId: id,
        plantId: toNum(plant?.id),
        name: gameConfig.getPlantName(toNum(plant?.id)),
        exp: gameConfig.getPlantExp(toNum(plant?.id))
      })
      continue
    }

    if (toNum(plant?.dry_num) > 0 || (toTimeSec(phase?.dry_time) > 0 && toTimeSec(phase?.dry_time) <= nowSec))
      result.needWater.push(id)

    const hasWeeds = (plant?.weed_owners?.length || 0) > 0 || (toTimeSec(phase?.weeds_time) > 0 && toTimeSec(phase?.weeds_time) <= nowSec)
    if (hasWeeds)
      result.needWeed.push(id)

    const hasBugs = (plant?.insect_owners?.length || 0) > 0 || (toTimeSec(phase?.insect_time) > 0 && toTimeSec(phase?.insect_time) <= nowSec)
    if (hasBugs)
      result.needBug.push(id)

    result.growing.push(id)
  }

  return result
}

export function getMultiSeasonGrowingLandIds(lands: any[], gameConfig: GameConfigService, nowSec = getServerTimeSec()): number[] {
  const multiSeasonSeeds = new Set(gameConfig.getMultiSeasonSeedIds?.() || [])
  const result: number[] = []
  for (const land of lands || []) {
    if (!land?.unlocked)
      continue
    const plant = land?.plant
    if (!plant?.phases?.length)
      continue
    const phase = getCurrentPhase(plant.phases, nowSec)
    if (!phase || toNum(phase?.phase) === PlantPhase.MATURE || toNum(phase?.phase) === PlantPhase.DEAD)
      continue
    const plantCfg = gameConfig.getPlantById(toNum(plant?.id))
    const seedId = toNum(plantCfg?.seed_id)
    if (seedId > 0 && multiSeasonSeeds.has(seedId))
      result.push(toNum(land?.id))
  }
  return result
}

export function formatOwnedLandsDetail(lands: any[], gameConfig: GameConfigService, nowSec = getServerTimeSec()) {
  const status = analyzeOwnedLands(lands, gameConfig, nowSec)
  const landsMap = buildLandMap(lands)
  const formatted = (lands || []).map((land: any) => {
    const id = toNum(land?.id)
    if (!land?.unlocked) {
      return {
        id,
        unlocked: false,
        status: 'locked',
        plantName: '',
        phaseName: '',
        level: toNum(land?.level),
        maxLevel: toNum(land?.max_level),
        couldUnlock: !!land?.could_unlock,
        couldUpgrade: !!land?.could_upgrade,
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
        level: toNum(land?.level),
        occupiedByMaster: context.occupiedByMaster,
        masterLandId: context.masterLandId,
        occupiedLandIds: context.occupiedLandIds,
        plantSize: 1
      }
    }

    const phase = getCurrentPhase(plant.phases, nowSec)
    if (!phase) {
      return {
        id,
        unlocked: true,
        status: 'empty',
        plantName: '',
        phaseName: '',
        level: toNum(land?.level),
        occupiedByMaster: context.occupiedByMaster,
        masterLandId: context.masterLandId,
        occupiedLandIds: context.occupiedLandIds,
        plantSize: 1
      }
    }

    const plantId = toNum(plant?.id)
    const plantCfg = gameConfig.getPlantById(plantId)
    const seedId = toNum(plantCfg?.seed_id)
    const totalSeasons = Number((plantCfg as any)?.seasons) || 1
    const currentSeason = Number((plant as any)?.cur_season) || 1
    const matureBegin = getMatureAtSec(plant.phases)
    const plantSize = Math.max(1, Number((plantCfg as any)?.size) || 1)
    const fruitId = Number((plantCfg as any)?.fruit?.id) || 0
    const fruitCount = Number((plantCfg as any)?.fruit?.count) || 0
    const fruitPrice = fruitId > 0 ? gameConfig.getFruitPrice(fruitId) : 0
    const growTimeSec = gameConfig.getPlantGrowTime(plantId)

    const mutantConfigIds: number[] = []
    if (Array.isArray(phase?.mutants)) {
      for (const mutant of phase.mutants)
        mutantConfigIds.push(toNum((mutant as any)?.mutant_config_id))
    }
    if (Array.isArray((plant as any)?.mutant_config_ids)) {
      for (const mutantId of (plant as any).mutant_config_ids)
        mutantConfigIds.push(toNum(mutantId))
    }
    const activeMutantIds = [...new Set(mutantConfigIds)].filter(Boolean)

    let landStatus = 'growing'
    if (toNum(phase?.phase) === PlantPhase.MATURE)
      landStatus = 'harvestable'
    else if (toNum(phase?.phase) === PlantPhase.DEAD)
      landStatus = 'dead'

    return {
      id,
      unlocked: true,
      status: landStatus,
      plantName: gameConfig.getPlantName(plantId),
      plantId,
      seedId,
      seedImage: seedId > 0 ? gameConfig.getSeedImageBySeedId(seedId) : '',
      phaseName: PHASE_NAMES[toNum(phase?.phase)] || '',
      matureInSec: matureBegin > nowSec ? matureBegin - nowSec : 0,
      needWater: toNum(plant?.dry_num) > 0,
      needWeed: (plant?.weed_owners?.length || 0) > 0,
      needBug: (plant?.insect_owners?.length || 0) > 0,
      stealable: !!plant?.stealable,
      level: toNum(land?.level),
      maxLevel: toNum(land?.max_level),
      couldUnlock: !!land?.could_unlock,
      couldUpgrade: !!land?.could_upgrade,
      currentSeason,
      totalSeasons,
      occupiedByMaster: context.occupiedByMaster,
      masterLandId: context.masterLandId,
      occupiedLandIds: context.occupiedLandIds,
      plantSize,
      fruitId,
      fruitName: fruitId > 0 ? gameConfig.getFruitName(fruitId) : '',
      fruitCount,
      fruitPrice,
      totalIncome: fruitCount * fruitPrice,
      exp: gameConfig.getPlantExp(plantId),
      growTime: growTimeSec,
      growTimeText: gameConfig.formatGrowTime(growTimeSec),
      landLevelNeed: Number((plantCfg as any)?.land_level_need) || 0,
      mutantActiveIds: activeMutantIds
    }
  })

  return {
    lands: formatted,
    summary: {
      harvestable: status.harvestable.length,
      growing: status.growing.length,
      empty: status.empty.length,
      dead: status.dead.length,
      needWater: status.needWater.length,
      needWeed: status.needWeed.length,
      needBug: status.needBug.length
    }
  }
}
