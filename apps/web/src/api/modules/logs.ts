import type { LogEntry, LogQueryOptions } from '../types'
import { socket } from '../services/socket'

export function query(opts?: LogQueryOptions): Promise<LogEntry[]> {
  return socket.request('logs.query', opts)
}
