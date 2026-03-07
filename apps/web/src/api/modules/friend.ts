import { ws } from '../services/ws'

export function getLands(gid: number): Promise<{ lands?: any[], summary?: any }> {
  return ws.get('/friend/lands', { gid })
}

export function operate(gid: number, opType: string): Promise<any> {
  return ws.post('/friend/operate', { gid, opType })
}

export function toggleBlacklist(gid: number): Promise<number[]> {
  return ws.post('/friend/blacklist/toggle', { gid })
}

export function onFriendsUpdate(handler: (data: any) => void): void {
  ws.on('friends:update', handler)
}
