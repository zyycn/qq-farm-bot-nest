import type * as Strategy from './types'
import { socket } from '../../services/socket'

export type * from './types'

export function save(data: Strategy.StrategySettingsPatch): Promise<Strategy.StrategySettings> {
  return socket.request('strategy.update', data)
}

export function query(): Promise<Strategy.StrategySettings> {
  return socket.request('strategy.query')
}
