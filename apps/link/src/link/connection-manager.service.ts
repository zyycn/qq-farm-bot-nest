import { Buffer } from 'node:buffer'
import { Injectable, Logger } from '@nestjs/common'
import { GameClient, UserState } from './game-client'
import { ProtoLoaderService } from './proto-loader.service'

export interface ConnectionInfo {
  accountId: string
  connected: boolean
  userState: UserState
}

@Injectable()
export class ConnectionManagerService {
  private readonly logger = new Logger(ConnectionManagerService.name)
  private clients = new Map<string, GameClient>()
  private eventHandler: ((accountId: string, event: string, data: any) => void) | null = null

  constructor(
    private readonly protoLoader: ProtoLoaderService
  ) {}

  onEvent(handler: (accountId: string, event: string, data: any) => void) {
    this.eventHandler = handler
  }

  private emitEvent(accountId: string, event: string, data: any) {
    this.eventHandler?.(accountId, event, data)
  }

  async connect(accountId: string, code: string, platform: string): Promise<UserState> {
    this.logger.log(`连接账号: ${accountId}, platform=${platform}`)
    const existing = this.clients.get(accountId)
    if (existing) {
      if (existing.isConnected()) {
        this.logger.log(`账号 ${accountId} 已连接, 复用现有连接`)
        return { ...existing.userState }
      }
      this.logger.log(`账号 ${accountId} 旧连接已断开, 销毁并重建`)
      existing.destroy()
      this.clients.delete(accountId)
    }

    const protoTypes = this.protoLoader.getProtoTypes()
    const client = new GameClient(accountId, protoTypes)

    client.on('login', (state: UserState) => {
      this.logger.log(`账号 ${accountId} 登录成功`)
      this.emitEvent(accountId, 'connected', state)
    })

    client.on('reconnecting', (info: any) => {
      this.logger.log(`账号 ${accountId} 正在重连 (${info.attempt}/${info.maxAttempts})`)
      this.emitEvent(accountId, 'reconnecting', info)
    })

    client.on('close', (_code: number) => {
      this.logger.log(`账号 ${accountId} 连接关闭, code=${_code}`)
      client.destroy()
      this.clients.delete(accountId)
      this.emitEvent(accountId, 'disconnected', { code: _code })
    })

    client.on('kickout', (info: any) => {
      this.logger.warn(`账号 ${accountId} 被踢下线: ${JSON.stringify(info)}`)
      this.emitEvent(accountId, 'kicked', info)
      client.destroy()
      this.clients.delete(accountId)
    })

    client.on('loginFailed', (err: Error) => {
      this.logger.warn(`账号 ${accountId} 登录失败: ${err.message}`)
      this.emitEvent(accountId, 'login_failed', { error: err.message })
    })

    client.on('ws_error', (info: any) => {
      this.logger.warn(`账号 ${accountId} WebSocket 错误: ${JSON.stringify(info)}`)
      this.emitEvent(accountId, 'ws_error', info)
    })

    client.on('notify', (data: any) => {
      this.emitEvent(accountId, 'notify', data)
    })

    client.on('stateChanged', (userState: UserState) => {
      this.emitEvent(accountId, 'state_update', userState)
    })

    this.clients.set(accountId, client)
    await client.connect(code, platform)
    return { ...client.userState }
  }

  async disconnect(accountId: string): Promise<void> {
    this.logger.log(`断开账号连接: ${accountId}`)
    const client = this.clients.get(accountId)
    if (client) {
      client.destroy()
      this.clients.delete(accountId)
    }
  }

  async send(accountId: string, service: string, method: string, bodyBase64: string): Promise<{ body: string, meta: any }> {
    const client = this.clients.get(accountId)
    if (!client || !client.isConnected())
      throw new Error(`账号 ${accountId} 未连接`)
    const bodyBuf = Buffer.from(bodyBase64, 'base64')
    const result = await client.sendMsgAsync(service, method, bodyBuf)
    return {
      body: result.body.toString('base64'),
      meta: result.meta || null
    }
  }

  getStatus(accountId: string): ConnectionInfo | null {
    const client = this.clients.get(accountId)
    if (!client)
      return null
    return {
      accountId,
      connected: client.isConnected(),
      userState: { ...client.userState }
    }
  }

  listConnections(): ConnectionInfo[] {
    const list: ConnectionInfo[] = []
    for (const [accountId, client] of this.clients) {
      list.push({
        accountId,
        connected: client.isConnected(),
        userState: { ...client.userState }
      })
    }
    return list
  }

  destroyAll() {
    this.logger.log('销毁所有账号连接')
    for (const client of this.clients.values())
      client.destroy()
    this.clients.clear()
  }
}
