import type { GameLogEntry, StatusEventData } from '../game/types'
import type { StatusEventName } from './runner/account-runner'
import {
  ACCOUNT_DATA_ACCOUNTS,
  ACCOUNT_DATA_ALMANAC,
  ACCOUNT_DATA_BAG,
  ACCOUNT_DATA_DAILY_GIFTS,
  ACCOUNT_DATA_FRIENDS,
  ACCOUNT_DATA_LANDS,
  ACCOUNT_DATA_PANEL,
  ACCOUNT_DATA_STRATEGY,
  ACCOUNT_KICKED,
  ACCOUNT_LOG,
  ACCOUNT_LOG_ACTION,
  ACCOUNT_STARTED,
  ACCOUNT_STATUS,
  ACCOUNT_STOPPED,
  ACCOUNT_WS_ERROR
} from '@qq-farm/shared'

export const ACCOUNT_STATUS_EVENT = ACCOUNT_STATUS
export const ACCOUNT_STARTED_EVENT = ACCOUNT_STARTED
export const ACCOUNT_STOPPED_EVENT = ACCOUNT_STOPPED
export const ACCOUNT_KICKED_EVENT = ACCOUNT_KICKED
export const ACCOUNT_WS_ERROR_EVENT = ACCOUNT_WS_ERROR
export const ACCOUNT_LOG_EVENT = ACCOUNT_LOG
export const ACCOUNT_LOG_ACTION_EVENT = ACCOUNT_LOG_ACTION
export const ACCOUNT_PUSH_EVENT = 'account.push'

export const ACCOUNT_DATA_ACCOUNTS_EVENT = ACCOUNT_DATA_ACCOUNTS
export const ACCOUNT_DATA_PANEL_EVENT = ACCOUNT_DATA_PANEL
export const ACCOUNT_DATA_STRATEGY_EVENT = ACCOUNT_DATA_STRATEGY
export const ACCOUNT_DATA_LANDS_EVENT = ACCOUNT_DATA_LANDS
export const ACCOUNT_DATA_BAG_EVENT = ACCOUNT_DATA_BAG
export const ACCOUNT_DATA_DAILY_GIFTS_EVENT = ACCOUNT_DATA_DAILY_GIFTS
export const ACCOUNT_DATA_FRIENDS_EVENT = ACCOUNT_DATA_FRIENDS
export const ACCOUNT_DATA_ALMANAC_EVENT = ACCOUNT_DATA_ALMANAC

export interface AccountStatusEventPayload {
  accountId: string
  event: StatusEventName
  data: StatusEventData
  accountName?: string
}

export interface AccountLifecycleEventPayload {
  accountId: string
  accountName?: string
  reason?: string
}

export interface AccountKickEventPayload {
  accountId: string
  reason: string
}

export interface AccountWsErrorEventPayload {
  accountId: string
  code: number
  message: string
}

export interface AccountDataEventPayload<T = unknown> {
  accountId: string
  data: T
}

export interface AccountLogEventPayload {
  accountId: string
  accountName?: string
  entry: GameLogEntry
}

export interface AccountPushEventPayload {
  target: 'broadcast' | 'event'
  route: string
  data: unknown
  accountId?: string
}
