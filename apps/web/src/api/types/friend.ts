import type { FarmLand } from './farm'

export interface FriendPlantSummary {
  stealNum: number
  dryNum: number
  weedNum: number
  insectNum: number
}

export interface FriendLandSummary {
  stealable?: number[]
  stealableInfo?: unknown[]
  needWater?: number[]
  needWeed?: number[]
  needBug?: number[]
  canPutWeed?: number[]
  canPutBug?: number[]
}

export interface FriendLandDetailResponse {
  lands?: FarmLand[]
  summary?: FriendLandSummary | null
}

export interface FriendInteractRecord {
  visitorGid: number
  visitorName: string
  actionType: number
  actionName: string
  serverTimeSec: number
  rewardText?: string
  targetName?: string
  [key: string]: unknown
}
