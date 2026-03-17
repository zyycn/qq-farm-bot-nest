import type { Server } from 'socket.io'
import { Injectable } from '@nestjs/common'
import { createEvent } from '@qq-farm/shared'
import { EmitDeduplicator } from './emit-deduplicator'

const ROOM_ALL = 'all'

function roomAccount(accountId: string): string {
  return `account:${accountId}`
}

function roomTopic(accountId: string, topic: string): string {
  return `account:${accountId}:${topic}`
}

function roomForEvent(accountId: string, event: string): string {
  return `account:${accountId}:${event}`
}

@Injectable()
export class RealtimePushService {
  private server: Server | null = null
  private dedup = new EmitDeduplicator()

  setServer(server: Server): void {
    this.server = server
  }

  broadcast(route: string, data: unknown): void {
    if (!this.server)
      return
    if (!this.dedup.hasChanged(route, data))
      return
    this.server.to(ROOM_ALL).emit('message', createEvent(route, data))
  }

  emitToAccount(accountId: string, route: string, data: unknown): void {
    const id = String(accountId || '').trim()
    if (!id || !this.server)
      return
    const room = roomAccount(id)
    this.server.to(room).emit('message', createEvent(route, data))
  }

  emitToTopic(accountId: string, topic: string, route: string, data: unknown): void {
    const id = String(accountId || '').trim()
    if (!id || !topic || !this.server)
      return
    const room = roomTopic(id, topic)
    this.server.to(room).emit('message', createEvent(route, data))
  }

  emitToEvent(accountId: string, route: string, data: unknown): void {
    const id = String(accountId || '').trim()
    if (!id || !route || !this.server)
      return
    if (!this.dedup.hasChanged(`${id}:${route}`, data))
      return
    const room = roomForEvent(id, route)
    this.server.to(room).emit('message', createEvent(route, data))
  }

  static roomForEvent(accountId: string, event: string): string {
    return roomForEvent(accountId, event)
  }

  static roomForAccount(accountId: string): string {
    return `account:${accountId}`
  }

  static roomForTopic(accountId: string, topic: string): string {
    return `account:${accountId}:${topic}`
  }

  static readonly ROOM_ALL = ROOM_ALL
}
