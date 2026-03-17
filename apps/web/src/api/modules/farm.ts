import type { SeedOption, SingleLandOperationPayload } from '../types'
import { socket } from '../services/socket'

export function operate(opType: string): Promise<unknown> {
  return socket.request('farm.execute', { opType })
}

export function querySeeds(): Promise<SeedOption[]> {
  return socket.request('seeds.query')
}

export function queryBagSeeds(): Promise<SeedOption[]> {
  return socket.request('bagSeeds.query')
}

export function singleLandOperate(payload: SingleLandOperationPayload): Promise<unknown> {
  return socket.request('farm.singleLandOp', {
    action: payload.action,
    landId: payload.landId,
    seedId: payload.seedId ?? 0
  })
}
