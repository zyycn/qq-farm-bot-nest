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
import { AccountManagerService } from '@/game/account-manager.service'
import { RealtimePushService } from './realtime-push.service'
import { WsRouterService } from './ws-router.service'

@WebSocketGateway({ cors: true })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server

  private logger = new Logger(RealtimeGateway.name)

  constructor(
    private jwtService: JwtService,
    private manager: AccountManagerService,
    private pushService: RealtimePushService,
    private router: WsRouterService
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      const token = socket.handshake.auth?.token
      if (!token) {
        next(new Error('Authentication required'))
        return
      }
      try {
        this.jwtService.verify(token as string)
        next()
      } catch {
        next(new Error('Invalid token'))
      }
    })
    this.pushService.setServer(server)
    this.manager.setRealtimeCallbacks({
      onStatusEvent: (accountId, event, data) => {
        const route = `accounts.${event}`
        this.pushService.emitToEvent(accountId, route, data)
      },
      onLog: (entry) => {
        const id = String(entry?.accountId ?? '').trim()
        if (id)
          this.pushService.emitToEvent(id, 'logs.append', entry)
      },
      onAccountsUpdate: data => this.pushService.broadcast('accounts.update', data),
      onLandsUpdate: (accountId, data) => this.pushService.emitToEvent(accountId, 'lands.update', data),
      onBagUpdate: (accountId, data) => this.pushService.emitToEvent(accountId, 'bag.update', data),
      onDailyGiftsUpdate: (accountId, data) => this.pushService.emitToEvent(accountId, 'dailyGifts.update', data),
      onFriendsUpdate: (accountId, data) => this.pushService.emitToEvent(accountId, 'friends.update', data),
      onAlmanacUpdate: (accountId, data) => this.pushService.emitToEvent(accountId, 'almanac.update', data)
      // strategy/panel 改为纯 req/res，不再推送事件
    })
    this.logger.log('WebSocket server (Socket.IO) started')
  }

  handleConnection(client: SocketWithMeta): void {
    client.data.accountId = ''
    client.data.topics = new Set<string>()
    client.data.events = new Set<string>()
    const pkg = require('../../../package.json')
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
    if (!payload || payload.t !== 'req' || !payload.r) {
      return
    }
    const id = payload.id ?? ''
    const route = payload.r
    const data = (payload.d ?? {}) as Record<string, unknown>
    const response = await this.router.dispatch(id, route, client, data)
    if (id && response)
      client.emit('message', response)
  }
}
