import { ws } from '../services/ws'

export function sell(itemId: number, count: number): Promise<any> {
  return ws.post('/warehouse/sell', { itemId, count })
}
