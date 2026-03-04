import type { IGameTransport, UserState } from './interfaces/game-transport.interface'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import net from 'node:net'
import { Logger } from '@nestjs/common'

interface PendingRequest {
  resolve: (value: any) => void
  reject: (reason: any) => void
  timer: ReturnType<typeof setTimeout>
}

interface FrameMessage {
  type: string
  rid?: string
  ok?: boolean
  error?: string
  body?: string
  meta?: any
  userState?: any
  accountId?: string
  event?: string
  data?: any
}

export interface ConnectorClientOptions {
  host?: string
  port?: number
  reconnectInterval?: number
}

/**
 * TCP 客户端：与 apps/connector 进程通信。
 * 实现 IGameTransport 接口，可透明替代直连 GameClient。
 */
export class ConnectorClient extends EventEmitter {
  private readonly logger = new Logger('ConnectorClient')
  private socket: net.Socket | null = null
  private buffer = Buffer.alloc(0)
  private pending = new Map<string, PendingRequest>()
  private ridCounter = 0
  private _connected = false
  private _destroyed = false
  private readonly host: string
  private readonly port: number
  private readonly reconnectInterval: number
  private protoTypesCache: Record<string, any> | null = null

  constructor(
    private readonly protoService: { types: Record<string, any> },
    options: ConnectorClientOptions = {}
  ) {
    super()
    this.host = options.host || '127.0.0.1'
    this.port = options.port || 9800
    this.reconnectInterval = options.reconnectInterval || 3000
  }

  get connected(): boolean { return this._connected }

  /** 连接到 connector 进程 */
  connect(): Promise<void> {
    if (this._destroyed)
      return Promise.reject(new Error('ConnectorClient 已销毁'))
    if (this._connected)
      return Promise.resolve()

    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ host: this.host, port: this.port }, () => {
        this._connected = true
        this.logger.log(`已连接到 Connector ${this.host}:${this.port}`)
        this.emit('connected')
        resolve()
      })

      this.socket.on('data', (chunk: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, chunk])
        this.processBuffer()
      })

      this.socket.on('close', () => {
        this._connected = false
        this.rejectAllPending('连接断开')
        this.emit('disconnected')
        if (!this._destroyed) {
          setTimeout(() => this.connect().catch(() => {}), this.reconnectInterval)
        }
      })

      this.socket.on('error', (err) => {
        if (!this._connected)
          reject(err)
        this.logger.warn(`TCP 连接错误: ${err.message}`)
      })
    })
  }

  destroy() {
    this._destroyed = true
    this._connected = false
    this.rejectAllPending('客户端已销毁')
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.destroy()
      this.socket = null
    }
    this.removeAllListeners()
  }

  private processBuffer() {
    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32BE(0)
      if (this.buffer.length < 4 + len)
        break
      const payload = this.buffer.subarray(4, 4 + len)
      this.buffer = this.buffer.subarray(4 + len)
      try {
        const msg: FrameMessage = JSON.parse(payload.toString('utf-8'))
        this.handleMessage(msg)
      } catch {}
    }
  }

  private handleMessage(msg: FrameMessage) {
    if (msg.type === 'response' && msg.rid) {
      const p = this.pending.get(msg.rid)
      if (p) {
        this.pending.delete(msg.rid)
        clearTimeout(p.timer)
        if (msg.ok)
          p.resolve(msg)
        else
          p.reject(new Error(msg.error || '未知错误'))
      }
      return
    }

    if (msg.type === 'event') {
      this.emit('connector_event', {
        accountId: msg.accountId,
        event: msg.event,
        data: msg.data
      })
    }
  }

  private sendRequest(data: any, timeout = 15000): Promise<FrameMessage> {
    return new Promise((resolve, reject) => {
      if (!this._connected || !this.socket) {
        reject(new Error('未连接到 Connector'))
        return
      }
      const rid = String(++this.ridCounter)
      data.rid = rid
      const json = JSON.stringify(data)
      const payload = Buffer.from(json, 'utf-8')
      const frame = Buffer.alloc(4 + payload.length)
      frame.writeUInt32BE(payload.length, 0)
      payload.copy(frame, 4)

      const timer = setTimeout(() => {
        this.pending.delete(rid)
        reject(new Error(`Connector 请求超时: ${data.type}`))
      }, timeout)

      this.pending.set(rid, { resolve, reject, timer })
      this.socket.write(frame)
    })
  }

  private rejectAllPending(reason: string) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error(reason))
    }
    this.pending.clear()
  }

  // ========== High-level API ==========

  async connectAccount(accountId: string, code: string, platform: string): Promise<any> {
    const res = await this.sendRequest({ type: 'connect', accountId, code, platform }, 30000)
    return res.userState
  }

  async disconnectAccount(accountId: string): Promise<void> {
    await this.sendRequest({ type: 'disconnect', accountId })
  }

  async getAccountStatus(accountId: string): Promise<any> {
    const res = await this.sendRequest({ type: 'status', accountId })
    return res.meta
  }

  async listConnections(): Promise<any[]> {
    const res = await this.sendRequest({ type: 'list' })
    return res.meta || []
  }

  // ========== IGameTransport per-account adapter ==========

  createTransport(accountId: string): IGameTransport {
    return new AccountTransport(accountId, this, this.protoService.types)
  }
}

/**
 * 为单个账号提供 IGameTransport 接口，内部通过 ConnectorClient 发送 TCP 请求。
 * 继承 EventEmitter 以支持 Workers 的事件订阅。
 */
class AccountTransport extends EventEmitter implements IGameTransport {
  readonly protoTypes: Record<string, any>
  readonly userState: UserState = { gid: 0, name: '', level: 0, gold: 0, exp: 0, coupon: 0, avatarUrl: '', openId: '' }

  constructor(
    private readonly accountId: string,
    private readonly connector: ConnectorClient,
    protoTypes: Record<string, any>
  ) {
    super()
    this.protoTypes = protoTypes
  }

  async sendMsgAsync(serviceName: string, methodName: string, bodyBytes: Buffer, timeout = 10000): Promise<{ body: Buffer, meta: any }> {
    const res = await (this.connector as any).sendRequest({
      type: 'send',
      accountId: this.accountId,
      service: serviceName,
      method: methodName,
      body: bodyBytes.toString('base64')
    }, timeout)
    return {
      body: Buffer.from(res.body || '', 'base64'),
      meta: res.meta || null
    }
  }

  isConnected(): boolean {
    return this.connector.connected
  }

  updateUserState(state: Partial<UserState>) {
    Object.assign(this.userState, state)
  }
}
