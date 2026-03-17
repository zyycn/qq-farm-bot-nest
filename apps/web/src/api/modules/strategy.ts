import type { StrategySettingsPatch } from '../types'
import { socket } from '../services/socket'

export function save(data: StrategySettingsPatch): Promise<void> {
  return socket.request('strategy.update', data)
}

export function query(): Promise<StrategySettingsPatch> {
  return socket.request('strategy.query')
}
