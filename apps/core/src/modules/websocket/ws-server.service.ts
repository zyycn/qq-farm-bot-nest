import type { OnModuleInit } from '@nestjs/common'
import type { IncomingMessage } from 'node:http'
import type { ClientMeta, WsRequest, WsRouteHandler } from './ws.types'
import process from 'node:process'
import { Injectable, Logger } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import WebSocket, { WebSocketServer } from 'ws'
import { AccountManagerService } from '../../game/account-manager.service'
import { StoreService } from '../../store/store.service'
import { AccountService } from '../account/account.service'

@Injectable()
export class WsServerService implements OnModuleInit {
  private logger = new Logger('WsServer')
  private wss!: WebSocketServer
  private clients = new Map<WebSocket, ClientMeta>()
  private routes = new Map<string, WsRouteHandler>()

  constructor(
    private httpAdapterHost: HttpAdapterHost,
    private jwtService: JwtService,
    private manager: AccountManagerService,
    private store: StoreService,
    private accountService: AccountService
  ) {
    this.registerRoutes()
  }

  onModuleInit(): void {
    const server = this.httpAdapterHost.httpAdapter.getHttpServer()
    this.wss = new WebSocketServer({ server, path: '/ws' })
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req))
    this.setupRealtimeCallbacks()
    this.logger.log('WebSocket server started on /ws')
  }

  // ==================== Connection lifecycle ====================

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const token = url.searchParams.get('token') || ''

    if (!token) {
      ws.close(4001, 'Missing token')
      return
    }

    try {
      this.jwtService.verify(token)
    } catch {
      ws.close(4001, 'Invalid token')
      return
    }

    const meta: ClientMeta = { accountId: '', topics: new Set() }
    this.clients.set(ws, meta)

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw))
        if (msg && typeof msg === 'object' && msg.id && msg.method && msg.url)
          this.handleRequest(ws, meta, msg as WsRequest)
      } catch (e: any) {
        this.logger.warn(`Bad message: ${e?.message}`)
      }
    })

    ws.on('close', () => {
      this.clients.delete(ws)
    })

    this.send(ws, { event: 'ready', data: { ok: true, ts: Date.now() } })
  }

  // ==================== Message routing ====================

  private async handleRequest(ws: WebSocket, meta: ClientMeta, msg: WsRequest): Promise<void> {
    const key = `${msg.method} ${msg.url}`
    const handler = this.routes.get(key)
    if (!handler) {
      this.send(ws, { id: msg.id, error: `Unknown route: ${key}` })
      return
    }
    try {
      const result = await handler(ws, meta, msg.data ?? {})
      this.send(ws, { id: msg.id, data: result ?? null })
    } catch (e: any) {
      this.send(ws, { id: msg.id, error: e?.message || '操作失败' })
    }
  }

  // ==================== Route definitions ====================

  private registerRoutes(): void {
    this.route('POST', '/subscribe', (_ws, meta, data) => this.handleSubscribe(_ws, meta, data))
    this.route('POST', '/account/start', (_ws, _meta, data) => this.handleAccountStart(data))
    this.route('POST', '/account/stop', (_ws, _meta, data) => this.handleAccountStop(data))
    this.route('POST', '/account', (_ws, _meta, data) => this.handleAccountCreate(data))
    this.route('DELETE', '/account', (_ws, _meta, data) => this.handleAccountDelete(data))
    this.route('POST', '/account/remark', (_ws, _meta, data) => this.handleAccountRemark(data))
    this.route('POST', '/farm/operate', (_ws, meta, data) => this.handleFarmOperate(meta, data))
    this.route('GET', '/friend/lands', (_ws, meta, data) => this.handleFriendLands(meta, data))
    this.route('POST', '/friend/operate', (_ws, meta, data) => this.handleFriendOperate(meta, data))
    this.route('POST', '/friend/blacklist/toggle', (_ws, meta, data) => this.handleFriendToggleBlacklist(meta, data))
    this.route('POST', '/settings', (_ws, meta, data) => this.handleSettingsSave(meta, data))
    this.route('POST', '/settings/theme', (_ws, _meta, data) => this.handleSettingsTheme(data))
    this.route('POST', '/settings/offline-reminder', (_ws, _meta, data) => this.handleSettingsOfflineReminder(data))
    this.route('GET', '/logs', (_ws, meta, data) => this.handleLogsQuery(meta, data))
    this.route('GET', '/analytics', (_ws, meta, data) => this.handleAnalyticsGet(meta, data))
    this.route('POST', '/warehouse/sell', (_ws, meta, data) => this.handleWarehouseSell(meta, data))
    this.route('POST', '/shop/buy', (_ws, meta, data) => this.handleShopBuy(meta, data))
  }

  private route(method: string, url: string, handler: WsRouteHandler): void {
    this.routes.set(`${method} ${url}`, handler)
  }

  // ==================== Handlers ====================

  private handleSubscribe(ws: WebSocket, meta: ClientMeta, data: any): any {
    const incoming = String(data?.accountId || '').trim()
    const topics: string[] = Array.isArray(data?.topics) ? data.topics : []

    const resolved = incoming && incoming !== 'all'
      ? this.manager.resolveAccountId(incoming)
      : ''

    const prevAccountId = meta.accountId
    meta.accountId = resolved
    meta.topics = new Set(topics.filter((t: any) => t && typeof t === 'string'))

    const pkg = require('../../../package.json')
    const subscribeResult = {
      accountId: resolved || 'all',
      uptime: process.uptime(),
      version: pkg.version
    }

    this.send(ws, { event: 'accounts:update', data: this.manager.getAccounts() })

    if (resolved) {
      const s = this.manager.getStatus(resolved)
      if (s)
        this.send(ws, { event: 'status:connection', data: { connected: s.connection?.connected, accountName: s.accountName } })
    }

    const contextChanged = prevAccountId !== resolved || topics.length > 0
    if (resolved && topics.length > 0 && contextChanged)
      this.pushTopicsInitialData(ws, meta)

    return subscribeResult
  }

  private async handleAccountStart(data: any): Promise<any> {
    const id = String(data?.id ?? '').trim()
    if (!id)
      throw new Error('缺少账号 id')
    await this.accountService.startAccount(id)
    this.manager.notifyAccountsUpdate()
    return null
  }

  private async handleAccountStop(data: any): Promise<any> {
    const id = String(data?.id ?? '').trim()
    if (!id)
      throw new Error('缺少账号 id')
    const resolved = this.manager.resolveAccountId(id) || id
    this.accountService.stopAccount(resolved)
    this.manager.notifyAccountsUpdate()
    return null
  }

  private async handleAccountCreate(data: any): Promise<any> {
    const result = await this.accountService.createOrUpdateAccount(data || {})
    this.manager.notifyAccountsUpdate()
    return result
  }

  private async handleAccountDelete(data: any): Promise<any> {
    const id = String(data?.id ?? '').trim()
    if (!id)
      throw new Error('缺少账号 id')
    const result = await this.accountService.deleteAccount(id)
    this.manager.notifyAccountsUpdate()
    return result
  }

  private async handleAccountRemark(data: any): Promise<any> {
    const result = await this.accountService.updateRemark(data || {})
    this.manager.notifyAccountsUpdate()
    return result
  }

  private async handleFarmOperate(meta: ClientMeta, data: any): Promise<any> {
    if (!meta.accountId)
      throw new Error('未选择账号')
    const runner = this.manager.getRunnerOrThrow(meta.accountId)
    return runner.doFarmOp(data?.opType)
  }

  private async handleFriendLands(meta: ClientMeta, data: any): Promise<any> {
    if (!meta.accountId)
      throw new Error('未选择账号')
    const gid = Number(data?.gid ?? data?.friendId)
    if (!gid)
      throw new Error('缺少好友 gid')
    const runner = this.manager.getRunnerOrThrow(meta.accountId)
    return runner.getFriendLands(gid)
  }

  private async handleFriendOperate(meta: ClientMeta, data: any): Promise<any> {
    if (!meta.accountId)
      throw new Error('未选择账号')
    const gid = Number(data?.gid)
    const opType = String(data?.opType || '')
    if (!gid || !opType)
      throw new Error('缺少 gid 或 opType')
    const runner = this.manager.getRunnerOrThrow(meta.accountId)
    return runner.doFriendOp(gid, opType)
  }

  private handleFriendToggleBlacklist(meta: ClientMeta, data: any): any {
    if (!meta.accountId)
      throw new Error('未选择账号')
    const gid = Number(data?.gid)
    if (!gid)
      throw new Error('缺少 gid')
    const current = this.store.getFriendBlacklist(meta.accountId)
    const next = current.includes(gid) ? current.filter(g => g !== gid) : [...current, gid]
    const saved = this.store.setFriendBlacklist(meta.accountId, next)
    this.manager.broadcastConfig(meta.accountId)
    this.manager.notifySettingsUpdate(meta.accountId)
    return saved
  }

  private handleSettingsSave(meta: ClientMeta, data: any): any {
    if (!meta.accountId)
      throw new Error('未选择账号')
    const result = this.store.applyConfigSnapshot(data || {}, meta.accountId)
    this.manager.broadcastConfig(meta.accountId)
    this.manager.notifySettingsUpdate(meta.accountId)
    return result
  }

  private handleSettingsTheme(data: any): any {
    return this.store.setUITheme(data?.theme)
  }

  private handleSettingsOfflineReminder(data: any): any {
    this.store.setOfflineReminder(data || {})
    return null
  }

  private handleLogsQuery(meta: ClientMeta, data: any): any {
    if (!meta.accountId)
      throw new Error('未选择账号')
    return this.manager.getLogs(meta.accountId, {
      module: data?.module || undefined,
      event: data?.event || undefined,
      keyword: data?.keyword || undefined,
      isWarn: data?.isWarn === 'warn' ? true : data?.isWarn === 'info' ? false : undefined,
      limit: data?.limit || 50
    })
  }

  private handleAnalyticsGet(meta: ClientMeta, data: any): any {
    if (!meta.accountId)
      throw new Error('未选择账号')
    const runner = this.manager.getRunnerOrThrow(meta.accountId)
    const sortBy = String(data?.sortBy ?? data?.sort ?? '')
    return runner.getAnalytics(sortBy)
  }

  private async handleWarehouseSell(meta: ClientMeta, data: any): Promise<any> {
    if (!meta.accountId)
      throw new Error('未选择账号')
    const itemId = Number(data?.itemId ?? data?.id)
    const count = Number(data?.count ?? 1)
    if (!itemId || count < 1)
      throw new Error('缺少 itemId 或 count')
    const runner = this.manager.getRunnerOrThrow(meta.accountId)
    return runner.sellItem(itemId, count)
  }

  private async handleShopBuy(meta: ClientMeta, data: any): Promise<any> {
    if (!meta.accountId)
      throw new Error('未选择账号')
    const goodsId = Number(data?.goodsId)
    const count = Number(data?.count ?? 1)
    const price = Number(data?.price)
    if (!goodsId || count < 1 || price == null || price < 0)
      throw new Error('缺少 goodsId、count 或 price')
    const runner = this.manager.getRunnerOrThrow(meta.accountId)
    return runner.buySeed(goodsId, count, price)
  }

  // ==================== Server push helpers ====================

  private setupRealtimeCallbacks(): void {
    this.manager.setRealtimeCallbacks({
      onStatusEvent: (accountId, event, data) => {
        if (event === 'connection')
          this.emitToAccount(accountId, 'status:connection', data)
        else
          this.emitToTopic(accountId, 'status', `status:${event}`, data)
      },
      onLog: (entry) => {
        const id = String(entry?.accountId || '').trim()
        if (id)
          this.emitToTopic(id, 'logs', 'log:new', entry)
      },
      onAccountsUpdate: (data) => {
        this.broadcast('accounts:update', data)
      },
      onLandsUpdate: (accountId, data) => {
        this.emitToTopic(accountId, 'lands', 'lands:update', data)
      },
      onBagUpdate: (accountId, data) => {
        this.emitToTopic(accountId, 'bag', 'bag:update', data)
      },
      onDailyGiftsUpdate: (accountId, data) => {
        this.emitToTopic(accountId, 'daily-gifts', 'daily-gifts:update', data)
      },
      onFriendsUpdate: (accountId, data) => {
        this.emitToTopic(accountId, 'friends', 'friends:update', data)
      },
      onSettingsUpdate: (accountId, data) => {
        this.emitToTopic(accountId, 'settings', 'settings:update', data)
      }
    })
  }

  private broadcast(event: string, data: any): void {
    const msg = JSON.stringify({ event, data })
    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(msg)
    }
  }

  private emitToAccount(accountId: string, event: string, data: any): void {
    const id = String(accountId || '').trim()
    if (!id)
      return
    const msg = JSON.stringify({ event, data })
    for (const [ws, meta] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN)
        continue
      if (meta.accountId === id || meta.accountId === '')
        ws.send(msg)
    }
  }

  private emitToTopic(accountId: string, topic: string, event: string, data: any): void {
    const id = String(accountId || '').trim()
    if (!id || !topic)
      return
    const msg = JSON.stringify({ event, data })
    for (const [ws, meta] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN)
        continue
      if (meta.accountId === id && meta.topics.has(topic))
        ws.send(msg)
    }
  }

  private send(ws: WebSocket, payload: Record<string, any>): void {
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify(payload))
  }

  // ==================== Topic initial data push ====================

  private pushTopicsInitialData(ws: WebSocket, meta: ClientMeta): void {
    const { accountId, topics } = meta

    if (accountId && topics.has('settings')) {
      const settingsData = {
        intervals: this.store.getIntervals(accountId),
        strategy: this.store.getPlantingStrategy(accountId),
        preferredSeed: this.store.getPreferredSeed(accountId),
        friendQuietHours: this.store.getFriendQuietHours(accountId),
        stealCropBlacklist: this.store.getStealCropBlacklist(accountId),
        friendBlacklist: this.store.getFriendBlacklist(accountId),
        automation: this.store.getAutomation(accountId),
        ui: this.store.getUI(),
        offlineReminder: this.store.getOfflineReminder()
      }
      this.send(ws, { event: 'settings:update', data: settingsData })
    }

    const runner = this.manager.getRunner(accountId)
    if (!runner)
      return

    if (topics.has('status')) {
      const s = this.manager.getStatus(accountId)
      if (s) {
        if (s.status)
          this.send(ws, { event: 'status:profile', data: s.status })
        this.send(ws, {
          event: 'status:session',
          data: {
            uptime: s.uptime,
            sessionExpGained: s.sessionExpGained,
            sessionGoldGained: s.sessionGoldGained,
            sessionCouponGained: s.sessionCouponGained,
            lastExpGain: s.lastExpGain,
            lastGoldGain: s.lastGoldGain,
            levelProgress: s.levelProgress
          }
        })
        if (s.operations)
          this.send(ws, { event: 'status:operations', data: s.operations })
        this.send(ws, {
          event: 'status:schedule',
          data: {
            farmRemainSec: s.nextChecks?.farmRemainSec ?? 0,
            friendRemainSec: s.nextChecks?.friendRemainSec ?? 0,
            configRevision: s.configRevision
          }
        })
      }
    }

    Promise.all([
      topics.has('lands') ? runner.getLands() : Promise.resolve(null),
      topics.has('bag') ? runner.getBag() : Promise.resolve(null),
      topics.has('daily-gifts') ? runner.getDailyGiftOverview() : Promise.resolve(null),
      topics.has('friends') ? runner.getFriends() : Promise.resolve(null),
      topics.has('seeds') ? runner.getSeeds() : Promise.resolve(null)
    ]).then(([lands, bag, dailyGifts, friends, seeds]) => {
      if (lands != null)
        this.send(ws, { event: 'lands:update', data: lands })
      if (bag != null)
        this.send(ws, { event: 'bag:update', data: bag })
      if (dailyGifts != null)
        this.send(ws, { event: 'daily-gifts:update', data: dailyGifts })
      if (friends != null)
        this.send(ws, { event: 'friends:update', data: friends })
      if (seeds != null)
        this.send(ws, { event: 'seeds:update', data: seeds })
    }).catch((err) => {
      this.logger.error('pushTopicsInitialData failed:', err)
    })
  }
}
