import type { UserState } from '@qq-farm/shared'
import type { TcpEvent, TcpResponse } from '@qq-farm/shared/node'
import type { IGameTransport } from './interfaces/game-transport.interface'
import type { RequestEnvelope, RequestExecutionResult } from './interfaces/request-pacing.interface'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import net from 'node:net'
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { createEmptyUserState } from '@qq-farm/shared'
import { encodeRequestFrame, FrameDecoder, TCP_HOST, TCP_PORT } from '@qq-farm/shared/node'
import { RequestPacingGateway } from '../behavior/request-pacing.gateway'

type TcpInbound = TcpResponse | TcpEvent

interface PendingRequest {
  resolve: (value: any) => void
  reject: (reason: any) => void
  timer: ReturnType<typeof setTimeout>
}

/** Link 连接状态元信息 */
export interface LinkAccountMeta {
  connected: boolean
  userState?: any
}

export interface LinkConnectionInfo {
  accountId: string
  connected: boolean
}

export type LinkEventName = 'connected' | 'disconnected' | 'state_update'
  | 'kicked' | 'ws_error' | 'reconnecting'
  | 'login_failed' | 'notify' | 'taskInfoNotify' | 'server_time'

@Injectable()
export class LinkClientService implements OnModuleInit, OnModuleDestroy {
  private static readonly DEFAULT_REQUEST_TIMEOUT_MS = 15_000
  private static readonly CONNECT_TIMEOUT_MS = 30_000

  private readonly logger = new Logger('LinkClient')
  private socket: net.Socket | null = null
  private readonly decoder = new FrameDecoder<TcpInbound>()
  private pending = new Map<string, PendingRequest>()
  private ridCounter = 0
  private _connected = false
  private _destroyed = false

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly requestPacingGateway: RequestPacingGateway
  ) {}

  get connected(): boolean { return this._connected }

  async onModuleInit() {
    try {
      await this.connect()
      this.logger.log('已连接到联机服务')
    } catch (e: any) {
      this.logger.warn(`连接联机服务失败，将在后台重试: ${e?.message}`)
    }
  }

  onModuleDestroy() {
    this.destroy()
  }

  connect(): Promise<void> {
    if (this._destroyed)
      return Promise.reject(new Error('联机客户端已销毁'))
    if (this._connected)
      return Promise.resolve()

    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ host: TCP_HOST, port: TCP_PORT }, () => {
        this._connected = true
        this.logger.log(`已连接到联机服务 ${TCP_HOST}:${TCP_PORT}`)
        this.eventEmitter.emit('link.connected')
        resolve()
      })

      this.socket.on('data', (chunk: Buffer) => {
        const messages = this.decoder.feed(chunk)
        for (const msg of messages)
          this.handleMessage(msg)
      })

      this.socket.on('close', () => {
        this._connected = false
        this.decoder.reset()
        this.rejectAllPending('连接断开')
        this.eventEmitter.emit('link.disconnected')
        if (!this._destroyed)
          setTimeout(() => this.connect().catch(() => {}), 3000)
      })

      this.socket.on('error', (err) => {
        if (!this._connected)
          reject(err)
        this.logger.warn(`传输连接异常: ${err.message}`)
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
  }

  private handleMessage(msg: TcpInbound) {
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
      this.eventEmitter.emit('link.account_event', {
        accountId: msg.accountId,
        event: msg.event as LinkEventName,
        data: msg.data
      })
    }
  }

  private sendRequest(data: Record<string, unknown>, timeout = LinkClientService.DEFAULT_REQUEST_TIMEOUT_MS): Promise<TcpResponse> {
    return new Promise((resolve, reject) => {
      if (!this._connected || !this.socket) {
        reject(new Error('未连接到 Link'))
        return
      }
      const rid = String(++this.ridCounter)
      data.rid = rid
      const frame = encodeRequestFrame(data)

      const timer = setTimeout(() => {
        this.pending.delete(rid)
        reject(new Error(`Link 请求超时: ${data.type}`))
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

  async connectAccount(accountId: string, code: string, platform: string, clientConfig?: object) {
    const res = await this.sendRequest({ type: 'connect', accountId, code, platform, clientConfig }, LinkClientService.CONNECT_TIMEOUT_MS)
    return res.userState as any | undefined
  }

  async rebindAccount(fromAccountId: string, toAccountId: string) {
    await this.sendRequest({ type: 'rebind', fromAccountId, toAccountId })
  }

  async disconnectAccount(accountId: string) {
    await this.sendRequest({ type: 'disconnect', accountId })
  }

  async getAccountStatus(accountId: string): Promise<LinkAccountMeta | undefined> {
    const res = await this.sendRequest({ type: 'status', accountId })
    return res.meta as LinkAccountMeta | undefined
  }

  async listConnections(): Promise<LinkConnectionInfo[]> {
    const res = await this.sendRequest({ type: 'list' })
    return (res.meta || []) as LinkConnectionInfo[]
  }

  async invokeForAccount(accountId: string, serviceName: string, methodName: string, params: Record<string, unknown>, timeout = 10000): Promise<TcpResponse> {
    return this.sendRequest({
      type: 'invoke',
      accountId,
      service: serviceName,
      method: methodName,
      params: params ?? {}
    }, timeout)
  }

  createTransport(accountId: string, getState?: () => UserState): IGameTransport {
    return new AccountTransport(accountId, this, this.requestPacingGateway, getState)
  }
}

class AccountTransport extends EventEmitter implements IGameTransport {
  private readonly fallbackState: UserState = createEmptyUserState()

  constructor(
    private readonly accountId: string,
    private readonly linkClient: LinkClientService,
    private readonly requestPacingGateway: RequestPacingGateway,
    private readonly getState?: () => UserState
  ) {
    super()
  }

  get userState(): UserState {
    return this.getState?.() ?? this.fallbackState
  }

  async invoke<T = unknown>(serviceName: string, methodName: string, params: Record<string, unknown>, timeout = 10000): Promise<{ data: T, meta?: any }> {
    return this.invokeWithPolicy<T>({
      service: serviceName,
      method: methodName,
      params,
      invokeTimeoutMs: timeout
    })
  }

  async invokeWithPolicy<T = unknown>(envelope: RequestEnvelope): Promise<RequestExecutionResult<T>> {
    return this.requestPacingGateway.invoke<T>(this.accountId, envelope, async () => {
      const res = await this.linkClient.invokeForAccount(
        this.accountId,
        envelope.service,
        envelope.method,
        envelope.params,
        envelope.invokeTimeoutMs ?? 10000
      )
      return { data: (res.data ?? null) as T, meta: res.meta }
    })
  }

  isConnected(): boolean {
    return this.linkClient.connected
  }
}
