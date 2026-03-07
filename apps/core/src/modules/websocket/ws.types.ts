import type { IncomingMessage } from 'node:http'
import type WebSocket from 'ws'

export type WsMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface WsRequest {
  id: string
  method: WsMethod
  url: string
  data?: any
}

export interface WsResponse {
  id: string
  data: any
}

export interface WsErrorResponse {
  id: string
  error: string
}

export interface WsPushMessage {
  event: string
  data: any
}

export interface ClientMeta {
  accountId: string
  topics: Set<string>
}

export type WsRouteHandler = (
  ws: WebSocket,
  meta: ClientMeta,
  data: any
) => any | Promise<any>

export interface WsConnectionContext {
  ws: WebSocket
  req: IncomingMessage
  meta: ClientMeta
}
