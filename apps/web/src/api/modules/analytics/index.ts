import type * as Analytics from './types'
import { socket } from '../../services/socket'

export type * from './types'

export function get(sortBy?: Analytics.AnalyticsSortKey): Promise<Analytics.AnalyticsCropRow[]> {
  return socket.request('analytics.query', { sortBy })
}
