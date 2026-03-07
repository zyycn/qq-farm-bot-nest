import type { Socket } from 'socket.io-client'
import { io } from 'socket.io-client'
import { ref } from 'vue'
import { SOCKET_PATH } from '@/stores/constants'

interface PendingRequest {
  event: string
  payload: any
  resolve: (value: any) => void
  reject: (reason: any) => void
}

type EventHandler = (...args: any[]) => void

class SocketManager {
  readonly connected = ref(false)
  readonly subscribedAccountId = ref('')
  /** 当前连接/订阅的账号 id，用于布局判断是否需在切换时 resetState */
  readonly currentAccountId = ref('')
  /** 后端进程运行秒数（来自 subscribed 事件） */
  readonly serverUptime = ref(0)
  /** 后端版本号（来自 subscribed 事件） */
  readonly serverVersion = ref('')
  /** 收到 uptime 的本地时间戳，用于计算运行时长 */
  readonly uptimeReceivedAt = ref(0)

  private socket: Socket | null = null
  private ready = false
  private currentTopics: string[] = []
  private pendingQueue: PendingRequest[] = []
  private eventHandlers = new Map<string, Set<EventHandler>>()

  connect(token: string, accountId: string) {
    const id = String(accountId || '').trim()
    if (!id)
      return
    if (!token)
      return

    this.currentAccountId.value = id

    if (this.socket) {
      if (this.socket.connected) {
        this.ready = false
        this.subscribedAccountId.value = ''
        this.socket.emit('subscribe', { accountId: id })
        if (this.currentTopics.length > 0)
          this.socket.emit('subscribe:topics', { topics: this.currentTopics })
        return
      }
      this.socket.auth = { token, accountId: id }
      this.socket.connect()
      return
    }

    this.socket = io('/', {
      path: SOCKET_PATH,
      autoConnect: false,
      transports: ['websocket'],
      auth: { token, accountId: id }
    })

    this.socket.on('connect', () => {
      this.connected.value = true
      this.ready = false
      this.subscribedAccountId.value = ''
      if (this.currentAccountId.value)
        this.socket!.emit('subscribe', { accountId: this.currentAccountId.value })
      else
        this.socket!.emit('subscribe', { accountId: 'all' })
      if (this.currentTopics.length > 0)
        this.socket!.emit('subscribe:topics', { topics: this.currentTopics })
    })

    this.socket.on('disconnect', () => {
      this.connected.value = false
      this.ready = false
      this.subscribedAccountId.value = ''
      this.serverUptime.value = 0
      this.serverVersion.value = ''
      this.uptimeReceivedAt.value = 0
    })

    this.socket.on('connect_error', (err: Error) => {
      this.connected.value = false
      this.ready = false
      console.error('[realtime] 连接失败:', err.message)
    })

    this.socket.on('subscribed', (payload: any) => {
      const id = (payload && typeof payload === 'object' && payload.accountId === 'all')
        ? ''
        : String((payload && payload.accountId) || '').trim()
      this.subscribedAccountId.value = id
      if (payload && typeof payload === 'object') {
        if (typeof payload.uptime === 'number') {
          this.serverUptime.value = payload.uptime
          this.uptimeReceivedAt.value = Date.now()
        }
        if (payload.version != null)
          this.serverVersion.value = String(payload.version)
      }
      this.ready = true
      this.flush()
    })

    this.eventHandlers.forEach((handlers, event) => {
      handlers.forEach(handler => this.socket!.on(event, handler))
    })

    this.socket.connect()
  }

  disconnect() {
    if (!this.socket)
      return
    while (this.pendingQueue.length) {
      const req = this.pendingQueue.shift()!
      req.reject(new Error('WebSocket 已断开'))
    }
    this.eventHandlers.forEach((handlers, event) => {
      handlers.forEach(handler => this.socket!.off(event, handler))
    })
    this.socket.off('connect')
    this.socket.off('disconnect')
    this.socket.off('connect_error')
    this.socket.off('subscribed')
    this.socket.disconnect()
    this.socket = null
    this.connected.value = false
    this.ready = false
    this.subscribedAccountId.value = ''
    this.currentAccountId.value = ''
    this.serverUptime.value = 0
    this.serverVersion.value = ''
    this.uptimeReceivedAt.value = 0
  }

  request<T = any>(event: string, payload?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const item: PendingRequest = { event, payload: payload ?? {}, resolve, reject }
      if (this.ready && this.socket?.connected) {
        this.emitWithAck(item)
      } else {
        this.pendingQueue.push(item)
      }
    })
  }

  private emitWithAck(item: PendingRequest) {
    if (!this.socket?.connected) {
      item.reject(new Error('WebSocket 未连接'))
      return
    }
    this.socket.emit(item.event, item.payload, (response: any) => {
      if (response && response.status === 'ok')
        item.resolve(response.data as any)
      else
        item.reject(new Error(response?.message || '请求失败'))
    })
  }

  private flush() {
    while (this.pendingQueue.length) {
      const item = this.pendingQueue.shift()!
      this.emitWithAck(item)
    }
  }

  subscribeTopics(topics: string[]) {
    this.currentTopics = Array.isArray(topics) ? topics : []
    if (this.socket?.connected)
      this.socket.emit('subscribe:topics', { topics: this.currentTopics })
  }

  on(event: string, handler: EventHandler) {
    let set = this.eventHandlers.get(event)
    if (!set) {
      set = new Set()
      this.eventHandlers.set(event, set)
    }
    set.add(handler)
    if (this.socket)
      this.socket.on(event, handler)
  }

  off(event: string, handler: EventHandler) {
    const set = this.eventHandlers.get(event)
    if (set) {
      set.delete(handler)
      if (this.socket)
        this.socket.off(event, handler)
    }
  }
}

export const ws = new SocketManager()
