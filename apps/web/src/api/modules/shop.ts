import { ws } from '../services/ws'

export function buy(goodsId: number, count: number, price: number): Promise<any> {
  return ws.post('/shop/buy', { goodsId, count, price })
}
