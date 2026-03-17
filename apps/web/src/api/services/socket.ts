import type { WsEvent, WsMessage, WsResponse } from '@qq-farm/shared'
import type { Socket } from 'socket.io-client'
import { createRequest } from '@qq-farm/shared'
import { io } from 'socket.io-client'
import { ref } from 'vue'

const REQUEST_TIMEOUT_MS = 30_000

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

interface QueuedRequest {
  route: string
  data: unknown
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

type EventHandler<T = unknown> = (data: T) => void

function generateId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export class SocketClient {
  readonly connected = ref(false)
  readonly subscribedAccountId = ref('')
  readonly currentAccountId = ref('')
  readonly serverUptime = ref(0)
  readonly serverVersion = ref('')
  readonly uptimeReceivedAt = ref(0)

  private socket: Socket | null = null
  private listeners = new Map<string, Set<EventHandler>>()
  private token = ''
  private topicRegistry = new Map<string, Set<string>>()
  private eventRegistry = new Map<string, Set<string>>()
  private pendingRequests = new Map<string, PendingRequest>()
  private queue: QueuedRequest[] = []
  private intentionalClose = false

  connect(token: string, accountId: string): void {
    const id = String(accountId || '').trim()
    if (!token)
      return

    this.token = token
    this.currentAccountId.value = id
    this.intentionalClose = false

    if (this.socket) {
      this.cleanupSocket()
    }

    this.createSocket()
  }

  disconnect(): void {
    this.intentionalClose = true

    for (const item of this.queue.splice(0))
      item.reject(new Error('WebSocket 已断开'))
    for (const [, pr] of this.pendingRequests) {
      clearTimeout(pr.timer)
      pr.reject(new Error('WebSocket 已断开'))
    }
    this.pendingRequests.clear()

    this.cleanupSocket()
    this.resetState()
  }

  request<T = unknown>(route: string, data?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.intentionalClose) {
        reject(new Error('WebSocket 已断开'))
        return
      }
      if (!this.socket?.connected) {
        this.queue.push({
          route,
          data,
          resolve: resolve as (v: unknown) => void,
          reject
        })
        return
      }
      this.sendRequest(route, data, resolve as (v: unknown) => void, reject)
    })
  }

  registerTopics(consumerId: string, topics: Set<string>, events: Set<string>): void {
    if (topics.size > 0)
      this.topicRegistry.set(consumerId, topics)
    else
      this.topicRegistry.delete(consumerId)
    if (events.size > 0)
      this.eventRegistry.set(consumerId, events)
    else
      this.eventRegistry.delete(consumerId)
    if (topics.size > 0 || events.size > 0)
      this.sendSubscribe([...topics], [...events])
  }

  unregisterTopics(consumerId: string): void {
    const topics = this.topicRegistry.get(consumerId)
    const events = this.eventRegistry.get(consumerId)
    this.topicRegistry.delete(consumerId)
    this.eventRegistry.delete(consumerId)
    if (this.socket?.connected && (topics?.size || events?.size))
      this.sendUnsubscribe([...(topics ?? [])], [...(events ?? [])])
  }

  on<T = unknown>(route: string, handler: EventHandler<T>): void {
    let set = this.listeners.get(route)
    if (!set) {
      set = new Set()
      this.listeners.set(route, set)
    }
    const listener = handler as EventHandler
    if (set.has(listener))
      return
    set.add(listener)
  }

  once<T = unknown>(route: string, handler: EventHandler<T>): void {
    const wrapper: EventHandler<T> = (data) => {
      this.off(route, wrapper)
      handler(data)
    }
    this.on(route, wrapper)
  }

  off<T = unknown>(route: string, handler: EventHandler<T>): void {
    const set = this.listeners.get(route)
    if (!set)
      return
    set.delete(handler as EventHandler)
    if (set.size === 0)
      this.listeners.delete(route)
  }

  private sendRequest(
    route: string,
    data: unknown,
    resolve: (value: unknown) => void,
    reject: (reason: unknown) => void
  ): void {
    if (!this.socket?.connected) {
      reject(new Error('WebSocket 未连接'))
      return
    }
    const id = generateId()
    const timer = setTimeout(() => {
      if (this.pendingRequests.delete(id)) {
        reject(new Error('请求超时'))
      }
    }, REQUEST_TIMEOUT_MS)

    this.pendingRequests.set(id, { resolve, reject, timer })
    const msg = createRequest(route, data, id)
    this.socket.emit('message', msg)
  }

  private handleMessage(payload: WsMessage): void {
    if (!payload || typeof payload !== 'object')
      return

    if (payload.t === 'res') {
      const res = payload as WsResponse
      const id = res.id
      if (id) {
        const pr = this.pendingRequests.get(id)
        if (pr) {
          clearTimeout(pr.timer)
          this.pendingRequests.delete(id)
          if (res.c === 0) {
            pr.resolve(res.d)
          } else {
            const errData = res.d as { message?: string } | undefined
            pr.reject(new Error(errData?.message ?? '请求失败'))
          }
        }
      }
      return
    }

    if (payload.t === 'event') {
      const evt = payload as WsEvent
      const route = evt.e
      if (!route)
        return

      if (route === 'system.ready') {
        const d = evt.d as { uptime?: number, version?: string } | undefined
        if (d && typeof d.uptime === 'number') {
          this.serverUptime.value = d.uptime
          this.uptimeReceivedAt.value = Date.now()
        }
        if (d?.version != null)
          this.serverVersion.value = String(d.version)
      }
      const set = this.listeners.get(route)
      if (set) {
        for (const fn of set)
          fn(evt.d)
      }
    }
  }

  private sendSubscribe(topics: string[], events: string[]): void {
    if (!this.socket?.connected)
      return
    this.subscribedAccountId.value = this.currentAccountId.value || ''
    const msg = createRequest('topics.sub', {
      accountId: this.currentAccountId.value,
      topics,
      events
    })
    this.socket.emit('message', msg)
  }

  private sendUnsubscribe(topics: string[], events: string[]): void {
    if (!this.socket?.connected)
      return
    const msg = createRequest('topics.unsub', {
      accountId: this.currentAccountId.value,
      topics,
      events
    })
    this.socket.emit('message', msg)
  }

  private resendAllSubscriptions(): void {
    if (!this.socket?.connected)
      return
    for (const [consumerId, topics] of this.topicRegistry) {
      const events = this.eventRegistry.get(consumerId)
      if (topics.size > 0 || (events?.size ?? 0) > 0)
        this.sendSubscribe([...topics], [...(events ?? [])])
    }
  }

  private flushQueue(): void {
    const items = this.queue.splice(0)
    for (const item of items)
      this.sendRequest(item.route, item.data, item.resolve, item.reject)
  }

  private createSocket(): void {
    this.socket = io({
      auth: { token: this.token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5
    })

    this.socket.on('message', (payload: WsMessage) => {
      this.handleMessage(payload)
    })

    this.socket.on('connect', () => {
      this.connected.value = true
      this.resendAllSubscriptions()
      this.flushQueue()
    })

    this.socket.on('disconnect', () => {
      this.connected.value = false
      this.subscribedAccountId.value = ''
      this.serverUptime.value = 0
      this.serverVersion.value = ''
      this.uptimeReceivedAt.value = 0

      for (const item of this.queue.splice(0))
        item.reject(new Error('WebSocket 连接断开'))
      for (const [, pr] of this.pendingRequests) {
        clearTimeout(pr.timer)
        pr.reject(new Error('WebSocket 连接断开'))
      }
      this.pendingRequests.clear()
    })

    this.socket.on('connect_error', (err: Error) => {
      this.connected.value = false
      if (this.intentionalClose)
        return
      for (const item of this.queue.splice(0))
        item.reject(err)
      for (const [, pr] of this.pendingRequests) {
        clearTimeout(pr.timer)
        pr.reject(err)
      }
      this.pendingRequests.clear()
    })
  }

  private cleanupSocket(): void {
    if (!this.socket)
      return
    this.socket.removeAllListeners()
    this.socket.disconnect()
    this.socket = null
  }

  private resetState(): void {
    this.connected.value = false
    this.subscribedAccountId.value = ''
    this.currentAccountId.value = ''
    this.serverUptime.value = 0
    this.serverVersion.value = ''
    this.uptimeReceivedAt.value = 0
  }
}

export const socket = new SocketClient()
