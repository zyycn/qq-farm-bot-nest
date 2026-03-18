import type * as Farm from './types'
import { socket } from '../../services/socket'

export type * from './types'

export function operate(opType: string): Promise<unknown> {
  return socket.request('farm.execute', { opType })
}

export function querySeeds(): Promise<Farm.SeedOption[]> {
  return socket.request('seeds.query')
}

export function queryBagSeeds(): Promise<Farm.SeedOption[]> {
  return socket.request('bagSeeds.query')
}

export function singleLandOperate(payload: Farm.SingleLandOperationPayload): Promise<unknown> {
  return socket.request('farm.singleLandOp', {
    action: payload.action,
    landId: payload.landId,
    seedId: payload.seedId ?? 0
  })
}
