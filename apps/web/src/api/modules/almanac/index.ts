import type * as Almanac from './types'
import { socket } from '../../services/socket'

export type * from './types'

export function query(refresh = false): Promise<Almanac.AlmanacOverview> {
  return socket.request('almanac.query', { refresh })
}

export function claimRewards(): Promise<Almanac.AlmanacClaimResult> {
  return socket.request('almanac.claimRewards')
}
