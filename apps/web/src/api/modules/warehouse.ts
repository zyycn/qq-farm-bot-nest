import { socket } from '../services/socket'

export function sell(itemId: number, count: number): Promise<unknown> {
  return socket.request('warehouse.sell', { itemId, count })
}
