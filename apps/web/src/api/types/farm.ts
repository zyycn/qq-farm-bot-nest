export interface SeedOption {
  seedId: number
  name: string
  count?: number
  requiredLevel?: number
  image?: string
  plantSize?: number
  goodsId?: number
  price?: number
  locked?: boolean
  soldOut?: boolean
}

export interface FarmSummary {
  harvestable?: number
  growing?: number
  empty?: number
  dead?: number
}

export interface FarmLand {
  id: number
  plantName?: string
  phaseName?: string
  seedImage?: string
  status: string
  matureInSec: number
  matureAt?: number
  needWater?: boolean
  needWeed?: boolean
  needBug?: boolean
  [key: string]: unknown
}

export interface FarmLandsResponse {
  lands?: FarmLand[]
  summary?: FarmSummary
}

export interface SingleLandOperationPayload {
  action: string
  landId: number
  seedId?: number
}
