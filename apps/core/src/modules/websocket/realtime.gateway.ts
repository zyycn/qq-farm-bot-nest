import type { OnModuleInit } from '@nestjs/common'
import type { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets'
import type { Server, Socket } from 'socket.io'
import { JwtService } from '@nestjs/jwt'
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { AccountManagerService } from '../../game/account-manager.service'
import { StoreService } from '../../store/store.service'
import { AccountService } from '../account/account.service'

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'x-account-id']
  }
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server!: Server

  constructor(
    private jwtService: JwtService,
    private manager: AccountManagerService,
    private store: StoreService,
    private accountService: AccountService
  ) {}

  onModuleInit() {
    this.manager.setRealtimeCallbacks({
      onStatusSync: (accountId, status) => {
        this.emitToAccount(accountId, 'status:update', { accountId, status })
      },
      onLog: (entry) => {
        const id = String(entry?.accountId || '').trim()
        if (id)
          this.server?.to(`account:${id}`)?.emit('log:new', entry)
        this.server?.to('account:all')?.emit('log:new', entry)
      },
      onAccountLog: (entry) => {
        const id = String(entry?.accountId || '').trim()
        if (id)
          this.server?.to(`account:${id}`)?.emit('account-log:new', entry)
        this.server?.to('account:all')?.emit('account-log:new', entry)
      },
      onAccountsUpdate: (data) => {
        this.server?.emit('accounts:update', data)
      },
      onLandsUpdate: (accountId, data) => {
        this.emitToAccount(accountId, 'lands:update', { accountId, data })
      },
      onBagUpdate: (accountId, data) => {
        this.emitToAccount(accountId, 'bag:update', { accountId, data })
      },
      onDailyGiftsUpdate: (accountId, data) => {
        this.emitToAccount(accountId, 'daily-gifts:update', { accountId, data })
      },
      onFriendsUpdate: (accountId, data) => {
        this.emitToAccount(accountId, 'friends:update', { accountId, data })
      },
      onSettingsUpdate: (accountId, data) => {
        this.emitToAccount(accountId, 'settings:update', { accountId, data })
      }
    })
  }

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token
        || socket.handshake.headers?.authorization?.replace('Bearer ', '')
        || ''

      if (!token) {
        socket.disconnect(true)
        return
      }

      this.jwtService.verify(token)
    } catch {
      socket.disconnect(true)
      return
    }

    const initialAccountRef = socket.handshake.auth?.accountId
      || socket.handshake.query?.accountId
      || ''
    this.applySubscription(socket, String(initialAccountRef))
    socket.emit('ready', { ok: true, ts: Date.now() })
  }

  handleDisconnect(_socket: Socket) {}

  @SubscribeMessage('subscribe')
  handleSubscribe(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    const body = payload && typeof payload === 'object' ? payload : {}
    this.applySubscription(socket, body.accountId || '')
  }

  @SubscribeMessage('farm:operate')
  async handleFarmOperate(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      const accountId = (socket.data as any).accountId as string
      if (!accountId)
        return { status: 'error', message: '未选择账号' }
      const runner = this.manager.getRunnerOrThrow(accountId)
      const result = await runner.doFarmOp(payload?.opType)
      return { status: 'ok', data: result }
    } catch (e: any) {
      return { status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('friend:lands')
  async handleFriendLands(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      const accountId = (socket.data as any).accountId as string
      if (!accountId)
        return { status: 'error', message: '未选择账号' }
      const gid = Number(payload?.gid ?? payload?.friendId)
      if (!gid)
        return { status: 'error', message: '缺少好友 gid' }
      const runner = this.manager.getRunnerOrThrow(accountId)
      const data = await runner.getFriendLands(gid)
      return { status: 'ok', data }
    } catch (e: any) {
      return { status: 'error', message: e?.message || '获取好友土地失败' }
    }
  }

  @SubscribeMessage('friend:operate')
  async handleFriendOperate(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      const accountId = (socket.data as any).accountId as string
      if (!accountId)
        return { status: 'error', message: '未选择账号' }
      const gid = Number(payload?.gid)
      const opType = String(payload?.opType || '')
      if (!gid || !opType)
        return { status: 'error', message: '缺少 gid 或 opType' }
      const runner = this.manager.getRunnerOrThrow(accountId)
      const result = await runner.doFriendOp(gid, opType)
      return { status: 'ok', data: result }
    } catch (e: any) {
      return { status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('friend:toggle-blacklist')
  async handleFriendToggleBlacklist(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      const accountId = (socket.data as any).accountId as string
      if (!accountId)
        return { status: 'error', message: '未选择账号' }
      const gid = Number(payload?.gid)
      if (!gid)
        return { status: 'error', message: '缺少 gid' }
      const current = this.store.getFriendBlacklist(accountId)
      const next = current.includes(gid) ? current.filter(g => g !== gid) : [...current, gid]
      const saved = this.store.setFriendBlacklist(accountId, next)
      this.manager.broadcastConfig(accountId)
      this.manager.notifySettingsUpdate(accountId)
      return { status: 'ok', data: saved }
    } catch (e: any) {
      return { status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('settings:save')
  async handleSettingsSave(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      const accountId = (socket.data as any).accountId as string
      if (!accountId)
        return { status: 'error', message: '未选择账号' }
      const result = this.store.applyConfigSnapshot(payload || {}, accountId)
      this.manager.broadcastConfig(accountId)
      this.manager.notifySettingsUpdate(accountId)
      return { status: 'ok', data: result }
    } catch (e: any) {
      return { status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('settings:automation')
  async handleSettingsAutomation(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      const accountId = (socket.data as any).accountId as string
      if (!accountId)
        return { status: 'error', message: '未选择账号' }
      const result = this.store.applyConfigSnapshot({ automation: payload || {} }, accountId)
      this.manager.broadcastConfig(accountId)
      this.manager.notifySettingsUpdate(accountId)
      return { status: 'ok', data: result }
    } catch (e: any) {
      return { status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('settings:theme')
  async handleSettingsTheme(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      const result = this.store.setUITheme(payload?.theme)
      return { status: 'ok', data: result }
    } catch (e: any) {
      return { status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('settings:offline-reminder')
  async handleSettingsOfflineReminder(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      this.store.setOfflineReminder(payload || {})
      return { status: 'ok', data: null }
    } catch (e: any) {
      return { status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('account:start')
  async handleAccountStart(@ConnectedSocket() _socket: Socket, @MessageBody() payload: any) {
    try {
      const id = String(payload?.id ?? '').trim()
      if (!id)
        return { status: 'error', message: '缺少账号 id' }
      await this.accountService.startAccount(id)
      this.manager.notifyAccountsUpdate()
      return { status: 'ok', data: null }
    } catch (e: any) {
      return { status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('account:stop')
  async handleAccountStop(@ConnectedSocket() _socket: Socket, @MessageBody() payload: any) {
    try {
      const id = String(payload?.id ?? '').trim()
      if (!id)
        return { status: 'error', message: '缺少账号 id' }
      const resolved = this.manager.resolveAccountId(id) || id
      this.accountService.stopAccount(resolved)
      this.manager.notifyAccountsUpdate()
      return { status: 'ok', data: null }
    } catch (e: any) {
      return { status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('account:create')
  async handleAccountCreate(@ConnectedSocket() _socket: Socket, @MessageBody() payload: any) {
    try {
      const data = await this.accountService.createOrUpdateAccount(payload || {})
      this.manager.notifyAccountsUpdate()
      return { status: 'ok', data }
    } catch (e: any) {
      return { status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('account:delete')
  async handleAccountDelete(@ConnectedSocket() _socket: Socket, @MessageBody() payload: any) {
    try {
      const id = String(payload?.id ?? '').trim()
      if (!id)
        return { status: 'error', message: '缺少账号 id' }
      const data = await this.accountService.deleteAccount(id)
      this.manager.notifyAccountsUpdate()
      return { status: 'ok', data }
    } catch (e: any) {
      return { status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('analytics:get')
  async handleAnalyticsGet(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      const accountId = (socket.data as any).accountId as string
      if (!accountId)
        return { status: 'error', message: '未选择账号' }
      const runner = this.manager.getRunnerOrThrow(accountId)
      const sortBy = String(payload?.sortBy ?? payload?.sort ?? '')
      const data = runner.getAnalytics(sortBy)
      return { status: 'ok', data }
    } catch (e: any) {
      return { status: 'error', message: e?.message || '获取分析数据失败' }
    }
  }

  @SubscribeMessage('account:remark')
  async handleAccountRemark(@ConnectedSocket() _socket: Socket, @MessageBody() payload: any) {
    try {
      const data = await this.accountService.updateRemark(payload || {})
      this.manager.notifyAccountsUpdate()
      return { status: 'ok', data }
    } catch (e: any) {
      return { status: 'error', message: e?.message || '操作失败' }
    }
  }

  private applySubscription(socket: Socket, accountRef: string) {
    const incoming = String(accountRef || '').trim()
    const resolved = incoming && incoming !== 'all'
      ? this.manager.resolveAccountId(incoming)
      : ''

    for (const room of socket.rooms) {
      if (room.startsWith('account:'))
        socket.leave(room)
    }

    if (resolved) {
      socket.join(`account:${resolved}`)
      ;(socket.data as any).accountId = resolved
    } else {
      socket.join('account:all')
      ;(socket.data as any).accountId = ''
    }

    socket.emit('subscribed', { accountId: (socket.data as any).accountId || 'all' })
    socket.emit('accounts:update', this.manager.getAccounts())

    try {
      const targetId = (socket.data as any).accountId || ''
      if (targetId) {
        const currentStatus = this.manager.getStatus(targetId)
        socket.emit('status:update', { accountId: targetId, status: currentStatus })
      }

      const currentLogs = this.manager.getLogs(targetId, { limit: 100 })
      socket.emit('logs:snapshot', {
        accountId: targetId || 'all',
        logs: Array.isArray(currentLogs) ? currentLogs : []
      })

      const currentAccountLogs = this.manager.getAccountLogs(100)
      socket.emit('account-logs:snapshot', {
        logs: Array.isArray(currentAccountLogs) ? currentAccountLogs : []
      })

      if (targetId) {
        const runner = this.manager.getRunner(targetId)
        if (runner) {
          Promise.all([
            runner.getLands(),
            runner.getBag(),
            runner.getDailyGiftOverview(),
            runner.getFriends(),
            runner.getSeeds()
          ]).then(([lands, bag, dailyGifts, friends, seeds]) => {
            if (lands != null)
              socket.emit('lands:update', { accountId: targetId, data: lands })
            if (bag != null)
              socket.emit('bag:update', { accountId: targetId, data: bag })
            if (dailyGifts != null)
              socket.emit('daily-gifts:update', { accountId: targetId, data: dailyGifts })
            if (friends != null)
              socket.emit('friends:update', { accountId: targetId, data: friends })
            if (seeds != null)
              socket.emit('seeds:update', { accountId: targetId, data: seeds })
          }).catch((err) => {
            console.error('[RealtimeGateway] applySubscription initial data push failed:', err)
          })
        }
        this.manager.notifySettingsUpdate(targetId)
      }
    } catch {}
  }

  private emitToAccount(accountId: string, event: string, data: any) {
    const id = String(accountId || '').trim()
    if (!id)
      return
    this.server?.to(`account:${id}`)?.emit(event, data)
    this.server?.to('account:all')?.emit(event, data)
  }
}
