import type { UserState } from '@qq-farm/shared'
import type { TcpOutbound } from '@qq-farm/shared/node'

export interface ReconnectingInfo {
  attempt: number
  maxAttempts: number
}

export interface WsErrorInfo {
  code: number
  message: string
}

export interface KickoutInfo {
  type: string
  reason: string
}

export interface ServerTimeInfo {
  ms: number
}

export interface LinkNotifyPayload {
  type: string
  body: string
  kind?: string
  decoded?: unknown
}

export interface LinkConnectionEventMap {
  connected: UserState
  reconnecting: ReconnectingInfo
  disconnected: { code: number }
  kicked: KickoutInfo
  login_failed: { error: string }
  ws_error: WsErrorInfo
  notify: LinkNotifyPayload
  taskInfoNotify: unknown
  state_update: UserState
  server_time: ServerTimeInfo
}

export type LinkConnectionEventName = keyof LinkConnectionEventMap

export type LinkTcpEventMessage = Extract<TcpOutbound, { type: 'event' }>
