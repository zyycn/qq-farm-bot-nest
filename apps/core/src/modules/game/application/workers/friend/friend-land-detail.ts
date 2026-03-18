import type { FriendLandAnalysis } from './friend-land-analysis'
import type { GameConfigService } from '@/modules/game/application/game-config.service'
import { getCurrentPhase } from '@/modules/game/application/session/helpers/land.helpers'
import { PHASE_NAMES, PlantPhase } from '@/modules/game/domain/constants'
import { getServerTimeSec, toNum, toTimeSec } from '@/modules/game/domain/utils'
import { buildLandMap, getDisplayLandContext } from './friend-land-analysis'

export interface FriendLandDetailItem {
  id: number
  unlocked: boolean
  status: string
  plantName: string
  phaseName: string
  level: number
  occupiedByMaster: boolean
  masterLandId: number
  occupiedLandIds: number[]
  plantSize: number
  seedId?: number
  seedImage?: string
  matureInSec?: number
  needWater?: boolean
  needWeed?: boolean
  needBug?: boolean
  currentSeason?: number
  totalSeasons?: number
}

export interface FriendLandDetailResponse {
  lands: FriendLandDetailItem[]
  summary: FriendLandAnalysis
}

export function buildFriendLandDetail(
  lands: any[],
  analyzed: FriendLandAnalysis,
  gameConfig: GameConfigService
): FriendLandDetailResponse {
  const nowSec = getServerTimeSec()
  const landsMap = buildLandMap(lands)
  const landsList = lands.map((land: any): FriendLandDetailItem => {
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
    const plantCfg = gameConfig.getPlantById(plantId)
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
      plantName: gameConfig.getPlantName(plantId),
      seedId,
      seedImage: seedId > 0 ? gameConfig.getSeedImageBySeedId(seedId) : '',
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
}
