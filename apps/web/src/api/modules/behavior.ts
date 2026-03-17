import type { BehaviorConfig } from '@qq-farm/shared'
import type { BehaviorInspectResponse } from '../types'
import { socket } from '../services/socket'

export function query(): Promise<BehaviorConfig> {
  return socket.request('behavior.query')
}

export function inspect(): Promise<BehaviorInspectResponse> {
  return socket.request('behavior.inspect')
}

export function update(data: Partial<BehaviorConfig>): Promise<BehaviorConfig> {
  return socket.request('behavior.update', data)
}
