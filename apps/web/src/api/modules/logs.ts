import { ws } from '../services/ws'

export interface LogQueryOptions {
  module?: string
  event?: string
  keyword?: string
  isWarn?: string
  limit?: number
}

export function query(opts?: LogQueryOptions): Promise<any[]> {
  return ws.get('/logs', opts)
}

export function onLogNew(handler: (data: any) => void): void {
  ws.on('log:new', handler)
}

export function offLogNew(handler: (data: any) => void): void {
  ws.off('log:new', handler)
}
