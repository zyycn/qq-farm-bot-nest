import type { AnalyticsCropRow, AnalyticsSortKey } from '../types'
import { socket } from '../services/socket'

export function get(sortBy?: AnalyticsSortKey): Promise<AnalyticsCropRow[]> {
  return socket.request('analytics.query', { sortBy })
}
