import { socket } from '../services/socket'

export function buy(goodsId: number, count: number, price: number): Promise<unknown> {
  return socket.request('shop.buy', { goodsId, count, price })
}
