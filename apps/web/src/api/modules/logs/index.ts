import type * as Logs from './types'
import { socket } from '../../services/socket'

export type * from './types'

export function query(opts?: Logs.LogQueryOptions): Promise<Logs.LogEntry[]> {
  return socket.request('logs.query', opts)
}
