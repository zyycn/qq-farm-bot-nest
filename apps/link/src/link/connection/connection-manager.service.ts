import type { UserState } from '@qq-farm/shared'
import type { ClientConfig } from '@qq-farm/shared/node'
import type { LinkConnectionEventMap, LinkConnectionEventName } from './game-client-events'
import { Injectable, Logger } from '@nestjs/common'
import { GameInvokeService } from '../game-invoke.service'
import { ProtoLoaderService } from '../proto/proto-loader.service'
import { GameClient } from './game-client'

export interface ConnectionInfo {
  accountId: string
  connected: boolean
  userState: UserState
}

@Injectable()
export class ConnectionManagerService {
  private readonly logger = new Logger(ConnectionManagerService.name)
  private clients = new Map<string, GameClient>()
  private eventHandler: (<T extends LinkConnectionEventName>(accountId: string, event: T, data: LinkConnectionEventMap[T]) => void) | null = null

  constructor(
    private readonly protoLoader: ProtoLoaderService,
    private readonly gameInvoke: GameInvokeService
  ) {}

  onEvent(handler: <T extends LinkConnectionEventName>(accountId: string, event: T, data: LinkConnectionEventMap[T]) => void) {
    this.eventHandler = handler
  }

  private emitEvent<T extends LinkConnectionEventName>(accountId: string, event: T, data: LinkConnectionEventMap[T]) {
    this.eventHandler?.(accountId, event, data)
  }

  async connect(accountId: string, code: string, platform: string, clientConfig?: ClientConfig): Promise<UserState> {
    this.logger.log(`连接账号: ${accountId}，平台=${platform}`)
    const existing = this.clients.get(accountId)
    if (existing) {
      if (existing.isConnected()) {
        this.logger.log(`账号 ${accountId} 已连接，复用现有连接`)
        return { ...existing.userState }
      }
      this.logger.log(`账号 ${accountId} 旧连接已断开，销毁并重建`)
      existing.destroy()
      this.clients.delete(accountId)
    }

    const protoTypes = this.protoLoader.getProtoTypes()
    const client = new GameClient(accountId, protoTypes, clientConfig)

    client.on('login', (state: UserState) => {
      this.logger.log(`账号 ${client.accountId} 登录成功`)
      this.emitEvent(client.accountId, 'connected', state)
    })

    client.on('reconnecting', (info) => {
      this.logger.log(`账号 ${client.accountId} 正在重连 (${info.attempt}/${info.maxAttempts})`)
      this.emitEvent(client.accountId, 'reconnecting', info)
    })

    client.on('close', (_code: number) => {
      this.logger.log(`账号 ${client.accountId} 连接关闭，状态码=${_code}`)
      client.destroy()
      this.clients.delete(client.accountId)
      this.emitEvent(client.accountId, 'disconnected', { code: _code })
    })

    client.on('kickout', (info) => {
      this.logger.warn(`账号 ${client.accountId} 被踢下线: ${JSON.stringify(info)}`)
      this.emitEvent(client.accountId, 'kicked', info)
      client.destroy()
      this.clients.delete(client.accountId)
    })

    client.on('loginFailed', (err: Error) => {
      this.logger.warn(`账号 ${client.accountId} 登录失败: ${err.message}`)
      this.emitEvent(client.accountId, 'login_failed', { error: err.message })
    })

    client.on('ws_error', (info) => {
      this.logger.warn(`账号 ${client.accountId} 套接字连接异常: ${JSON.stringify(info)}`)
      this.emitEvent(client.accountId, 'ws_error', info)
    })

    client.on('notify', (data) => {
      this.emitEvent(client.accountId, 'notify', data)
    })

    client.on('taskInfoNotify', (data) => {
      this.emitEvent(client.accountId, 'taskInfoNotify', data)
    })

    client.on('stateChanged', (userState: UserState) => {
      this.emitEvent(client.accountId, 'state_update', userState)
    })

    client.on('serverTime', (data) => {
      this.emitEvent(client.accountId, 'server_time', data)
    })

    this.clients.set(accountId, client)
    await client.connect(code, platform)
    return { ...client.userState }
  }

  async rebind(fromId: string, toId: string): Promise<void> {
    const from = this.clients.get(fromId)
    if (!from)
      throw new Error(`待改绑账号不存在: ${fromId}`)

    const existingTo = this.clients.get(toId)
    if (existingTo) {
      this.logger.log(`改绑前断开已有目标账号连接: ${toId}`)
      try {
        existingTo.destroy()
      } catch (e) {
        this.logger.warn(`销毁目标账号 ${toId} 连接时出错: ${e}`)
      }
      this.clients.delete(toId)
    }

    this.logger.log(`改绑连接: ${fromId} -> ${toId}`)
    this.clients.delete(fromId)
    from.accountId = toId
    this.clients.set(toId, from)
  }

  async disconnect(accountId: string): Promise<void> {
    this.logger.log(`断开账号连接: ${accountId}`)
    const client = this.clients.get(accountId)
    if (client) {
      try {
        client.destroy()
      } catch (e) {
        this.logger.warn(`断开账号 ${accountId} 时出错: ${e}`)
      }
      this.clients.delete(accountId)
    }
  }

  /** 语义调用：由 link 负责 proto 编解码，core 只传 service/method/params */
  async invoke(accountId: string, service: string, method: string, params: Record<string, unknown>): Promise<{ data: unknown, meta: unknown }> {
    if (!this.gameInvoke.isReady())
      throw new Error('调用服务未就绪（完整协议定义尚未加载）')
    const bodyBuf = this.gameInvoke.encodeRequest(service, method, params)
    if (!bodyBuf)
      throw new Error(`不支持的调用: ${service}.${method}`)
    const client = this.clients.get(accountId)
    if (!client || !client.isConnected())
      throw new Error(`账号 ${accountId} 未连接`)
    const result = await client.sendMsgAsync(service, method, bodyBuf)
    const data = this.gameInvoke.decodeReply(service, method, result.body)
    return { data: data ?? undefined, meta: result.meta || null }
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
