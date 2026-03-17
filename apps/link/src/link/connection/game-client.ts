import type { UserState } from '@qq-farm/shared'
import type { ClientConfig } from '@qq-farm/shared/node'
import type { ProtoTypeRegistry } from '../proto/proto-runtime'
import type { GameClientActivityController } from './game-client-activity'
import type { GameClientConfig } from './game-client-config'
import type { MessageCallback } from './game-client-message'
import type { GameClientTransportController } from './game-client-transport'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { createEmptyUserState, Scheduler, syncServerTime } from '@qq-farm/shared'
import WebSocket from 'ws'
import * as cryptoWasm from '../crypto/crypto-wasm'
import { GameClientActivityController as ActivityController } from './game-client-activity'
import { createGameClientConfig } from './game-client-config'
import { handleIncomingGameMessage } from './game-client-message'
import { handleGameClientNotify } from './game-client-notify'
import {
  buildLoginRequestBody,
  parseLoginReply
} from './game-client-packets'
import { GameClientTransportController as TransportController } from './game-client-transport'

const RE_UNEXPECTED_RESPONSE = /Unexpected server response:\s*(\d+)/i

function normalizeWsMessageData(data: Buffer | ArrayBuffer | Buffer[]): Buffer {
  if (Buffer.isBuffer(data))
    return data
  if (Array.isArray(data))
    return Buffer.concat(data)
  return Buffer.from(new Uint8Array(data))
}

export type { UserState } from '@qq-farm/shared'

export class GameClient extends EventEmitter {
  private ws: WebSocket | null = null
  private clientSeq = 1
  private serverSeq = 0
  private pendingCallbacks = new Map<number, MessageCallback>()
  readonly scheduler: Scheduler
  readonly userState: UserState = createEmptyUserState()
  private readonly activity: GameClientActivityController
  private readonly transport: GameClientTransportController

  private savedCode: string | null = null
  private platform = 'qq'
  private _connected = false
  private _destroyed = false

  private _reconnectAttempts = 0
  private _loginFailed = false
  private static readonly MAX_RECONNECT_ATTEMPTS = 3

  private _accountId: string
  private cfg: GameClientConfig

  constructor(
    accountId: string,
    private readonly protoTypes: ProtoTypeRegistry,
    clientConfig?: ClientConfig
  ) {
    super()
    this._accountId = accountId
    this.scheduler = new Scheduler(`gc-${accountId}`)
    this.cfg = createGameClientConfig(clientConfig)
    this.transport = new TransportController({
      protoTypes: this.protoTypes,
      scheduler: this.scheduler,
      pendingCallbacks: this.pendingCallbacks,
      getSocket: () => this.ws,
      getClientSeq: () => this.clientSeq,
      setClientSeq: seq => this.clientSeq = seq,
      getServerSeq: () => this.serverSeq,
      onBusinessMessageSent: () => this.activity.scheduleBcrf()
    })
    this.activity = new ActivityController({
      scheduler: this.scheduler,
      protoTypes: this.protoTypes,
      clientVersion: this.cfg.clientVersion,
      isConnected: () => this._connected,
      getUserGid: () => this.userState.gid,
      sendMsg: (serviceName, methodName, bodyBytes, callback) => this.sendMsg(serviceName, methodName, bodyBytes, callback),
      onConnectionStale: () => {
        this.pendingCallbacks.forEach((cb) => {
          try {
            cb(new Error('连接超时，已清理'))
          } catch {}
        })
        this.pendingCallbacks.clear()
      },
      onServerTime: ms => this.emit('serverTime', { ms })
    })
  }

  get accountId(): string {
    return this._accountId
  }

  set accountId(id: string) {
    this._accountId = id
  }

  get connected(): boolean { return this._connected }
  get destroyed(): boolean { return this._destroyed }

  async sendMsg(serviceName: string, methodName: string, bodyBytes: Buffer, callback?: MessageCallback): Promise<boolean> {
    return this.transport.sendMsg(
      serviceName,
      methodName,
      bodyBytes,
      body => cryptoWasm.encryptBuffer(body),
      callback
    )
  }

  sendMsgAsync(serviceName: string, methodName: string, bodyBytes: Buffer, timeout = 10000): Promise<{ body: Buffer, meta: unknown }> {
    return this.transport.sendMsgAsync(
      serviceName,
      methodName,
      bodyBytes,
      timeout,
      (nextService, nextMethod, nextBody, callback) => this.sendMsg(nextService, nextMethod, nextBody, callback)
    )
  }

  private async handleMessage(data: Buffer) {
    this.serverSeq = handleIncomingGameMessage(data, {
      accountId: this.accountId,
      protoTypes: this.protoTypes,
      pendingCallbacks: this.pendingCallbacks,
      serverSeq: this.serverSeq,
      onNotify: msg => this.handleNotify(msg)
    })
  }

  private handleNotify(msg: unknown) {
    handleGameClientNotify(msg, {
      protoTypes: this.protoTypes,
      userState: this.userState,
      emit: (eventName, payload) => {
        this.emit(eventName, payload)
      }
    })
  }

  private sendLogin(): Promise<void> {
    return new Promise((resolve, reject) => {
      const body = buildLoginRequestBody(this.protoTypes, this.cfg)

      this.sendMsg('gamepb.userpb.UserService', 'Login', body, (err, bodyBytes) => {
        if (err) {
          if (err.message.includes('code=')) {
            this._loginFailed = true
            this.emit('loginFailed', err)
          }
          reject(err)
          return
        }
        try {
          const reply = parseLoginReply(this.protoTypes, bodyBytes!)
          this.userState.gid = reply.gid
          this.userState.name = reply.name
          this.userState.level = reply.level
          this.userState.gold = reply.gold
          this.userState.exp = reply.exp
          this.userState.avatarUrl = reply.avatarUrl
          this.userState.openId = reply.openId
          if (reply.serverTimeMs != null) {
            syncServerTime(reply.serverTimeMs)
            this.emit('serverTime', { ms: reply.serverTimeMs })
          }
          this._connected = true

          this._reconnectAttempts = 0
          this._loginFailed = false
          this.activity.resetOnLogin()
          this.emit('login', this.userState)
          resolve()
        } catch (e: unknown) {
          const error = e as { message?: string }
          this._loginFailed = true
          reject(new Error(`解析登录响应失败: ${error?.message}`))
        }
      }).then((sent) => {
        if (!sent)
          reject(new Error('发送登录请求失败'))
      }).catch(reject)
    })
  }

  connect(code: string, platform = 'qq'): Promise<void> {
    if (this._destroyed)
      return Promise.reject(new Error('游戏客户端已销毁'))
    this.savedCode = code
    this.platform = platform
    this._loginFailed = false
    const url = `${this.cfg.serverUrl}?platform=${platform}&os=${this.cfg.os}&ver=${this.cfg.clientVersion}&code=${code}&openID=`

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          'User-Agent': this.cfg.userAgent,
          'Origin': this.cfg.origin
        }
      })
      this.ws.binaryType = 'arraybuffer'

      this.ws.on('open', () => {
        this.sendLogin().then(resolve).catch(reject)
      })

      this.ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
        this.handleMessage(normalizeWsMessageData(data))
      })

      this.ws.on('close', (closeCode: number) => {
        this._connected = false
        this.cleanup()
        reject(new Error(`连接已关闭，状态码=${closeCode}`))

        const shouldReconnect = !this._destroyed
          && this.savedCode
          && !this._loginFailed
          && this._reconnectAttempts < GameClient.MAX_RECONNECT_ATTEMPTS

        if (shouldReconnect) {
          this._reconnectAttempts++
          this.emit('reconnecting', {
            attempt: this._reconnectAttempts,
            maxAttempts: GameClient.MAX_RECONNECT_ATTEMPTS
          })
          this.scheduler.setTimeoutTask('auto_reconnect', 5000, () => {
            this.reconnect().catch(() => {})
          })
        } else {
          this._loginFailed = false
          this.emit('close', closeCode)
        }
      })

      this.ws.on('error', (err: Error) => {
        const message = err.message || ''
        const match = message.match(RE_UNEXPECTED_RESPONSE)
        if (match) {
          const errCode = Number.parseInt(match[1], 10) || 0
          if (errCode)
            this.emit('ws_error', { code: errCode, message })
        }
      })
    })
  }

  private cleanup() {
    this.activity.clear()
    this.scheduler.clearAll()
    this.pendingCallbacks.clear()
  }

  async reconnect(newCode?: string): Promise<void> {
    this.cleanup()
    if (this.ws) {
      this.ws.removeAllListeners()
      this.ws.close()
      this.ws = null
    }
    this.userState.gid = 0
    this._connected = false
    this.clientSeq = 1
    this.serverSeq = 0
    await this.connect(newCode || this.savedCode!, this.platform)
  }

  isConnected(): boolean {
    return this._connected && !!this.ws && this.ws.readyState === 1
  }

  destroy() {
    this._destroyed = true
    this._connected = false
    this.cleanup()
    if (this.ws) {
      this.ws.removeAllListeners()
      this.ws.on('error', () => {}) // 防止关闭时触发未处理错误
      try {
        this.ws.close()
      } catch {}
      this.ws = null
    }
    this.removeAllListeners()
  }
}
