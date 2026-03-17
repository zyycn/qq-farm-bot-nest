import type { FriendInteractRecord, FriendLandDetailResponse } from '../types'
import { socket } from '../services/socket'

export function getLands(gid: number): Promise<FriendLandDetailResponse> {
  return socket.request('friends.lands', { gid })
}

export function operate(gid: number, opType: string): Promise<unknown> {
  return socket.request('friends.execute', { gid, opType })
}

export function toggleBlacklist(gid: number): Promise<number[]> {
  return socket.request('friends.toggleBlacklist', { gid })
}

export function getInteractRecords(): Promise<FriendInteractRecord[]> {
  return socket.request('friends.interactRecords')
}
