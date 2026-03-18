import type { LogEntry } from '../logs/types'

export interface DailyGiftTask {
  desc?: string
  name?: string
  progress?: number
  current?: number
  totalProgress?: number
  target?: number
  [key: string]: unknown
}

export interface DailyGift {
  key: string
  label: string
  enabled?: boolean
  doneToday: boolean
  lastAt?: number
  completedCount?: number
  totalCount?: number
  tasks?: DailyGiftTask[]
  hasGift?: boolean
  hasCard?: boolean
  [key: string]: unknown
}

export interface DailyGiftsResponse {
  date: string
  growth: DailyGift
  gifts: DailyGift[]
}

export interface AccountConnectionState {
  connected?: boolean
}

export interface AccountProfileState {
  name?: string
  level?: number
  gold?: number
  coupon?: number
  [key: string]: unknown
}

export interface AccountLevelProgress {
  current?: number
  needed?: number
}

export interface AccountNextChecks {
  farmRemainSec: number
  friendRemainSec: number
}

export interface AccountRealtimeStatus {
  connection?: AccountConnectionState
  wsError?: unknown
  status?: AccountProfileState
  bootAt?: number
  sessionExpGained?: number
  sessionGoldGained?: number
  sessionCouponGained?: number
  lastExpGain?: number
  lastGoldGain?: number
  levelProgress?: AccountLevelProgress
  operations?: Record<string, number>
  nextChecks?: AccountNextChecks
  configRevision?: number
  [key: string]: unknown
}

export interface StatusUpdatePayload {
  status?: AccountRealtimeStatus
}

export interface StatusConnectionPayload {
  connected?: boolean
  wsError?: unknown
}

export interface StatusSchedulePayload {
  farmRemainSec?: number
  friendRemainSec?: number
  configRevision?: number
}

export type RealtimeLogEntry = LogEntry
