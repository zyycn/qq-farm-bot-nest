import type { WsRequest } from '@qq-farm/shared'
import type { SocketWithMeta } from './ws-router.service'
import process from 'node:process'
import { Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets'
import { createEvent } from '@qq-farm/shared'
import { Server } from 'socket.io'
import { RealtimePushService } from './realtime-push.service'
import { WsRouterService } from './ws-router.service'

@WebSocketGateway({ cors: true })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server

  private readonly logger = new Logger(RealtimeGateway.name)

  constructor(
    private readonly jwtService: JwtService,
    private readonly pushService: RealtimePushService,
    private readonly router: WsRouterService
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      const token = socket.handshake.auth?.token
      if (!token) {
        next(new Error('缺少认证信息'))
        return
      }
      try {
        this.jwtService.verify(token as string)
        next()
      } catch {
        next(new Error('令牌无效'))
      }
    })

    this.pushService.setServer(server)
    this.logger.log('实时通信服务已启动')
  }

  handleConnection(client: SocketWithMeta): void {
    client.data.accountId = ''
    client.data.topics = new Set<string>()
    client.data.events = new Set<string>()
    const pkg = require('../../package.json')
    client.emit('message', createEvent('system.ready', {
      uptime: process.uptime(),
      version: pkg.version,
      ts: Date.now()
    }))
  }

  handleDisconnect(): void {}

  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: SocketWithMeta,
    @MessageBody() payload: WsRequest
  ): Promise<void> {
    if (!payload || payload.t !== 'req' || !payload.r)
      return

    const id = payload.id ?? ''
    const route = payload.r
    const data = (payload.d ?? {}) as Record<string, unknown>
    const response = await this.router.dispatch(id, route, client, data)
    if (id && response)
      client.emit('message', response)
  }
}
