import { ref } from 'vue'

interface Pending {
  resolve: (data: any) => void
  reject: (err: any) => void
  timer: ReturnType<typeof setTimeout>
}

interface QueuedRequest {
  method: string
  url: string
  data: any
  resolve: (value: any) => void
  reject: (reason: any) => void
}

type EventHandler = (data: any) => void

const REQUEST_TIMEOUT_MS = 10_000
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

export class WSClient {
  readonly connected = ref(false)
  readonly subscribedAccountId = ref('')
  readonly currentAccountId = ref('')
  readonly serverUptime = ref(0)
  readonly serverVersion = ref('')
  readonly uptimeReceivedAt = ref(0)

  private ws?: WebSocket
  private pending = new Map<string, Pending>()
  private listeners = new Map<string, Set<EventHandler>>()
  private token = ''
  private currentTopics: string[] = []
  private queue: QueuedRequest[] = []
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private reconnectAttempt = 0
  private intentionalClose = false

  connect(token: string, accountId: string): void {
    const id = String(accountId || '').trim()
    if (!token)
      return

    this.token = token
    this.currentAccountId.value = id
    this.intentionalClose = false

    if (this.ws) {
      this.cleanupSocket()
    }

    this.createSocket()
  }

  disconnect(): void {
    this.intentionalClose = true
    this.clearReconnectTimer()

    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error('WebSocket 已断开'))
    }
    this.pending.clear()

    for (const item of this.queue.splice(0))
      item.reject(new Error('WebSocket 已断开'))

    this.cleanupSocket()
    this.resetState()
  }

  subscribe(accountId: string, topics?: string[]): Promise<any> {
    this.currentAccountId.value = String(accountId || '').trim()
    if (topics != null)
      this.currentTopics = Array.isArray(topics) ? topics : []
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
      return Promise.resolve(null)
    return this.post('/subscribe', {
      accountId: this.currentAccountId.value,
      topics: this.currentTopics
    })
  }

  get<T = any>(url: string, data?: any): Promise<T> {
    return this.request('GET', url, data)
  }

  post<T = any>(url: string, data?: any): Promise<T> {
    return this.request('POST', url, data)
  }

  put<T = any>(url: string, data?: any): Promise<T> {
    return this.request('PUT', url, data)
  }

  delete<T = any>(url: string, data?: any): Promise<T> {
    return this.request('DELETE', url, data)
  }

  on(event: string, handler: EventHandler): void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(handler)
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler)
  }

  // ==================== Internal ====================

  private request<T = any>(method: string, url: string, data?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.intentionalClose) {
        reject(new Error('WebSocket 已断开'))
        return
      }
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.queue.push({ method, url, data, resolve, reject })
        return
      }
      this.sendRequest(method, url, data, resolve, reject)
    })
  }

  private sendRequest(method: string, url: string, data: any, resolve: (v: any) => void, reject: (e: any) => void): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket 未连接'))
      return
    }
    const id = crypto.randomUUID()
    const payload = { id, method, url, data }
    const timer = setTimeout(() => {
      this.pending.delete(id)
      reject(new Error('请求超时'))
    }, REQUEST_TIMEOUT_MS)
    this.pending.set(id, { resolve, reject, timer })
    this.ws.send(JSON.stringify(payload))
  }

  private flushQueue(): void {
    const items = this.queue.splice(0)
    for (const item of items)
      this.sendRequest(item.method, item.url, item.data, item.resolve, item.reject)
  }

  private createSocket(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = `${protocol}//${host}/ws?token=${encodeURIComponent(this.token)}`

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.connected.value = true
      this.reconnectAttempt = 0

      if (this.currentAccountId.value || this.currentTopics.length > 0) {
        this.post('/subscribe', {
          accountId: this.currentAccountId.value,
          topics: this.currentTopics
        }).catch(() => {})
      }

      this.flushQueue()
    }

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (!msg || typeof msg !== 'object')
          return

        if (msg.id && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id)!
          clearTimeout(p.timer)
          this.pending.delete(msg.id)
          if (msg.error)
            p.reject(new Error(msg.error))
          else
            p.resolve(msg.data)
          return
        }

        if (msg.event) {
          if (msg.event === 'subscribed' || (msg.id && msg.data && typeof msg.data === 'object' && msg.data.uptime !== undefined)) {
            this.handleSubscribed(msg.data)
          }
          this.listeners.get(msg.event)?.forEach(fn => fn(msg.data))
        }
      } catch {}
    }

    this.ws.onclose = () => {
      this.connected.value = false
      this.subscribedAccountId.value = ''
      this.serverUptime.value = 0
      this.serverVersion.value = ''
      this.uptimeReceivedAt.value = 0

      for (const [id, p] of this.pending) {
        clearTimeout(p.timer)
        p.reject(new Error('WebSocket 连接断开'))
        this.pending.delete(id)
      }

      for (const item of this.queue.splice(0))
        item.reject(new Error('WebSocket 连接断开'))

      if (!this.intentionalClose)
        this.scheduleReconnect()
    }

    this.ws.onerror = () => {}
  }

  private handleSubscribed(data: any): void {
    if (!data || typeof data !== 'object')
      return
    const id = data.accountId === 'all' ? '' : String(data.accountId || '').trim()
    this.subscribedAccountId.value = id
    if (typeof data.uptime === 'number') {
      this.serverUptime.value = data.uptime
      this.uptimeReceivedAt.value = Date.now()
    }
    if (data.version != null)
      this.serverVersion.value = String(data.version)
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer()
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS)
    this.reconnectAttempt++
    this.reconnectTimer = setTimeout(() => {
      if (!this.intentionalClose)
        this.createSocket()
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
  }

  private cleanupSocket(): void {
    if (!this.ws)
      return
    this.ws.onopen = null
    this.ws.onmessage = null
    this.ws.onclose = null
    this.ws.onerror = null
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
      this.ws.close()
    this.ws = undefined
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

export const ws = new WSClient()
