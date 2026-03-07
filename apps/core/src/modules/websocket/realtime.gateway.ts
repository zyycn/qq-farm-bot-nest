import type { OnModuleInit } from '@nestjs/common'
import type { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets'
import type { Server, Socket } from 'socket.io'
import process from 'node:process'
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
      onStatusEvent: (accountId, event, data) => {
        const payload = { accountId, ...data }
        if (event === 'connection')
          this.emitToAccount(accountId, 'status:connection', payload)
        else
          this.emitToTopic(accountId, 'status', `status:${event}`, payload)
      },
      onLog: (entry) => {
        const id = String(entry?.accountId || '').trim()
        if (id)
          this.emitToTopic(id, 'logs', 'log:new', entry)
      },
      onAccountsUpdate: (data) => {
        this.server?.emit('accounts:update', data)
      },
      onLandsUpdate: (accountId, data) => {
        this.emitToTopic(accountId, 'lands', 'lands:update', { accountId, data })
      },
      onBagUpdate: (accountId, data) => {
        this.emitToTopic(accountId, 'bag', 'bag:update', { accountId, data })
      },
      onDailyGiftsUpdate: (accountId, data) => {
        this.emitToTopic(accountId, 'daily-gifts', 'daily-gifts:update', { accountId, data })
      },
      onFriendsUpdate: (accountId, data) => {
        this.emitToTopic(accountId, 'friends', 'friends:update', { accountId, data })
      },
      onSettingsUpdate: (accountId, data) => {
        this.emitToTopic(accountId, 'settings', 'settings:update', { accountId, data })
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

  @SubscribeMessage('subscribe:topics')
  handleSubscribeTopics(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    const body = payload && typeof payload === 'object' ? payload : {}
    const topics = Array.isArray(body.topics) ? body.topics : []
    const accountId = (socket.data as any).accountId as string
    const prev = (socket.data as any).topics as string[] | undefined
    const prevAccountId = (socket.data as any).lastTopicAccountId as string | undefined
    const sameTopics = Array.isArray(prev) && prev.length === topics.length && topics.every((t, i) => t === prev[i])
    const sameContext = sameTopics && prevAccountId === accountId
    ;(socket.data as any).topics = topics
    ;(socket.data as any).lastTopicAccountId = accountId
    this.leaveAllTopicRooms(socket)
    if (accountId) {
      for (const t of topics) {
        if (t && typeof t === 'string')
          socket.join(`topic:${accountId}:${t}`)
      }
      if (topics.length > 0 && !sameContext)
        this.pushTopicsInitialData(socket, accountId, topics)
    }
  }

  @SubscribeMessage('logs:query')
  async handleLogsQuery(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      const accountId = (socket.data as any).accountId as string
      if (!accountId)
        return { action: 'logs:query', status: 'error', message: '未选择账号' }
      const opts = {
        module: payload?.module || undefined,
        event: payload?.event || undefined,
        keyword: payload?.keyword || undefined,
        isWarn: payload?.isWarn === 'warn' ? true : payload?.isWarn === 'info' ? false : undefined,
        limit: payload?.limit || 50
      }
      const logs = this.manager.getLogs(accountId, opts)
      return { action: 'logs:query', status: 'ok', accountId, data: logs }
    } catch (e: any) {
      return { action: 'logs:query', status: 'error', message: e?.message || '获取日志失败' }
    }
  }

  @SubscribeMessage('farm:operate')
  async handleFarmOperate(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      const accountId = (socket.data as any).accountId as string
      if (!accountId)
        return { action: 'farm:operate', status: 'error', message: '未选择账号' }
      const runner = this.manager.getRunnerOrThrow(accountId)
      const result = await runner.doFarmOp(payload?.opType)
      return { action: 'farm:operate', status: 'ok', accountId, data: result }
    } catch (e: any) {
      return { action: 'farm:operate', status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('friend:lands')
  async handleFriendLands(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      const accountId = (socket.data as any).accountId as string
      if (!accountId)
        return { action: 'friend:lands', status: 'error', message: '未选择账号' }
      const gid = Number(payload?.gid ?? payload?.friendId)
      if (!gid)
        return { action: 'friend:lands', status: 'error', message: '缺少好友 gid' }
      const runner = this.manager.getRunnerOrThrow(accountId)
      const data = await runner.getFriendLands(gid)
      return { action: 'friend:lands', status: 'ok', accountId, data }
    } catch (e: any) {
      return { action: 'friend:lands', status: 'error', message: e?.message || '获取好友土地失败' }
    }
  }

  @SubscribeMessage('friend:operate')
  async handleFriendOperate(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      const accountId = (socket.data as any).accountId as string
      if (!accountId)
        return { action: 'friend:operate', status: 'error', message: '未选择账号' }
      const gid = Number(payload?.gid)
      const opType = String(payload?.opType || '')
      if (!gid || !opType)
        return { action: 'friend:operate', status: 'error', message: '缺少 gid 或 opType' }
      const runner = this.manager.getRunnerOrThrow(accountId)
      const result = await runner.doFriendOp(gid, opType)
      return { action: 'friend:operate', status: 'ok', accountId, data: result }
    } catch (e: any) {
      return { action: 'friend:operate', status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('friend:toggle-blacklist')
  async handleFriendToggleBlacklist(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      const accountId = (socket.data as any).accountId as string
      if (!accountId)
        return { action: 'friend:toggle-blacklist', status: 'error', message: '未选择账号' }
      const gid = Number(payload?.gid)
      if (!gid)
        return { action: 'friend:toggle-blacklist', status: 'error', message: '缺少 gid' }
      const current = this.store.getFriendBlacklist(accountId)
      const next = current.includes(gid) ? current.filter(g => g !== gid) : [...current, gid]
      const saved = this.store.setFriendBlacklist(accountId, next)
      this.manager.broadcastConfig(accountId)
      this.manager.notifySettingsUpdate(accountId)
      return { action: 'friend:toggle-blacklist', status: 'ok', accountId, data: saved }
    } catch (e: any) {
      return { action: 'friend:toggle-blacklist', status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('settings:save')
  async handleSettingsSave(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      const accountId = (socket.data as any).accountId as string
      if (!accountId)
        return { action: 'settings:save', status: 'error', message: '未选择账号' }
      const result = this.store.applyConfigSnapshot(payload || {}, accountId)
      this.manager.broadcastConfig(accountId)
      this.manager.notifySettingsUpdate(accountId)
      return { action: 'settings:save', status: 'ok', accountId, data: result }
    } catch (e: any) {
      return { action: 'settings:save', status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('settings:automation')
  async handleSettingsAutomation(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      const accountId = (socket.data as any).accountId as string
      if (!accountId)
        return { action: 'settings:automation', status: 'error', message: '未选择账号' }
      const result = this.store.applyConfigSnapshot({ automation: payload || {} }, accountId)
      this.manager.broadcastConfig(accountId)
      this.manager.notifySettingsUpdate(accountId)
      return { action: 'settings:automation', status: 'ok', accountId, data: result }
    } catch (e: any) {
      return { action: 'settings:automation', status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('settings:theme')
  async handleSettingsTheme(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      const result = this.store.setUITheme(payload?.theme)
      return { action: 'settings:theme', status: 'ok', data: result }
    } catch (e: any) {
      return { action: 'settings:theme', status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('settings:offline-reminder')
  async handleSettingsOfflineReminder(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      this.store.setOfflineReminder(payload || {})
      return { action: 'settings:offline-reminder', status: 'ok', data: null }
    } catch (e: any) {
      return { action: 'settings:offline-reminder', status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('account:start')
  async handleAccountStart(@ConnectedSocket() _socket: Socket, @MessageBody() payload: any) {
    try {
      const id = String(payload?.id ?? '').trim()
      if (!id)
        return { action: 'account:start', status: 'error', message: '缺少账号 id' }
      await this.accountService.startAccount(id)
      this.manager.notifyAccountsUpdate()
      return { action: 'account:start', status: 'ok', data: null }
    } catch (e: any) {
      return { action: 'account:start', status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('account:stop')
  async handleAccountStop(@ConnectedSocket() _socket: Socket, @MessageBody() payload: any) {
    try {
      const id = String(payload?.id ?? '').trim()
      if (!id)
        return { action: 'account:stop', status: 'error', message: '缺少账号 id' }
      const resolved = this.manager.resolveAccountId(id) || id
      this.accountService.stopAccount(resolved)
      this.manager.notifyAccountsUpdate()
      return { action: 'account:stop', status: 'ok', data: null }
    } catch (e: any) {
      return { action: 'account:stop', status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('account:create')
  async handleAccountCreate(@ConnectedSocket() _socket: Socket, @MessageBody() payload: any) {
    try {
      const data = await this.accountService.createOrUpdateAccount(payload || {})
      this.manager.notifyAccountsUpdate()
      return { action: 'account:create', status: 'ok', data }
    } catch (e: any) {
      return { action: 'account:create', status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('account:delete')
  async handleAccountDelete(@ConnectedSocket() _socket: Socket, @MessageBody() payload: any) {
    try {
      const id = String(payload?.id ?? '').trim()
      if (!id)
        return { action: 'account:delete', status: 'error', message: '缺少账号 id' }
      const data = await this.accountService.deleteAccount(id)
      this.manager.notifyAccountsUpdate()
      return { action: 'account:delete', status: 'ok', data }
    } catch (e: any) {
      return { action: 'account:delete', status: 'error', message: e?.message || '操作失败' }
    }
  }

  @SubscribeMessage('analytics:get')
  async handleAnalyticsGet(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    try {
      const accountId = (socket.data as any).accountId as string
      if (!accountId)
        return { action: 'analytics:get', status: 'error', message: '未选择账号' }
      const runner = this.manager.getRunnerOrThrow(accountId)
      const sortBy = String(payload?.sortBy ?? payload?.sort ?? '')
      const data = runner.getAnalytics(sortBy)
      return { action: 'analytics:get', status: 'ok', accountId, data }
    } catch (e: any) {
      return { action: 'analytics:get', status: 'error', message: e?.message || '获取分析数据失败' }
    }
  }

  @SubscribeMessage('account:remark')
  async handleAccountRemark(@ConnectedSocket() _socket: Socket, @MessageBody() payload: any) {
    try {
      const data = await this.accountService.updateRemark(payload || {})
      this.manager.notifyAccountsUpdate()
      return { action: 'account:remark', status: 'ok', data }
    } catch (e: any) {
      return { action: 'account:remark', status: 'error', message: e?.message || '操作失败' }
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
    this.leaveAllTopicRooms(socket)

    if (resolved) {
      socket.join(`account:${resolved}`)
      ;(socket.data as any).accountId = resolved
    } else {
      socket.join('account:all')
      ;(socket.data as any).accountId = ''
    }

    const pkg = require('../../../package.json')
    socket.emit('subscribed', {
      accountId: (socket.data as any).accountId || 'all',
      uptime: process.uptime(),
      version: pkg.version
    })
    socket.emit('accounts:update', this.manager.getAccounts())

    try {
      const targetId = (socket.data as any).accountId || ''
      if (targetId)
        this.emitStatusSnapshotToSocket(socket, targetId)
    } catch {}
  }

  private emitStatusSnapshotToSocket(socket: Socket, accountId: string) {
    const s = this.manager.getStatus(accountId)
    if (!s)
      return
    socket.emit('status:connection', { accountId, connected: s.connection?.connected, accountName: s.accountName })
  }

  private emitToAccount(accountId: string, event: string, data: any) {
    const id = String(accountId || '').trim()
    if (!id)
      return
    this.server?.to(`account:${id}`)?.emit(event, data)
    this.server?.to('account:all')?.emit(event, data)
  }

  private emitToTopic(accountId: string, topic: string, event: string, data: any) {
    const id = String(accountId || '').trim()
    if (!id || !topic)
      return
    this.server?.to(`topic:${id}:${topic}`)?.emit(event, data)
  }

  private leaveAllTopicRooms(socket: Socket) {
    for (const room of socket.rooms) {
      if (room.startsWith('topic:'))
        socket.leave(room)
    }
  }

  private pushTopicsInitialData(socket: Socket, accountId: string, topics: string[]) {
    const runner = this.manager.getRunner(accountId)
    if (!runner)
      return
    const topicSet = new Set(topics)
    if (topicSet.has('status')) {
      const s = this.manager.getStatus(accountId)
      if (s) {
        if (s.status)
          socket.emit('status:profile', { accountId, ...s.status })
        socket.emit('status:session', {
          accountId,
          uptime: s.uptime,
          sessionExpGained: s.sessionExpGained,
          sessionGoldGained: s.sessionGoldGained,
          sessionCouponGained: s.sessionCouponGained,
          lastExpGain: s.lastExpGain,
          lastGoldGain: s.lastGoldGain,
          levelProgress: s.levelProgress
        })
        if (s.operations)
          socket.emit('status:operations', { accountId, ...s.operations })
        socket.emit('status:schedule', {
          accountId,
          farmRemainSec: s.nextChecks?.farmRemainSec ?? 0,
          friendRemainSec: s.nextChecks?.friendRemainSec ?? 0,
          configRevision: s.configRevision
        })
      }
    }
    Promise.all([
      topicSet.has('lands') ? runner.getLands() : Promise.resolve(null),
      topicSet.has('bag') ? runner.getBag() : Promise.resolve(null),
      topicSet.has('daily-gifts') ? runner.getDailyGiftOverview() : Promise.resolve(null),
      topicSet.has('friends') ? runner.getFriends() : Promise.resolve(null),
      topicSet.has('seeds') ? runner.getSeeds() : Promise.resolve(null)
    ]).then(([lands, bag, dailyGifts, friends, seeds]) => {
      if (lands != null)
        socket.emit('lands:update', { accountId, data: lands })
      if (bag != null)
        socket.emit('bag:update', { accountId, data: bag })
      if (dailyGifts != null)
        socket.emit('daily-gifts:update', { accountId, data: dailyGifts })
      if (friends != null)
        socket.emit('friends:update', { accountId, data: friends })
      if (seeds != null)
        socket.emit('seeds:update', { accountId, data: seeds })
    }).catch((err) => {
      console.error('[RealtimeGateway] pushTopicsInitialData failed:', err)
    })
    if (topicSet.has('settings'))
      this.manager.notifySettingsUpdate(accountId)
  }
}
