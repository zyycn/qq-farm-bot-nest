import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { AccountRunnerCallbacks, StatusEventName } from './account-runner'
import process from 'node:process'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { StoreService } from '../store/store.service'
import { AccountRunner } from './account-runner'
import { EmitDeduplicator } from './emit-deduplicator'
import { GameConfigService } from './game-config.service'
import { GameLogService } from './game-log.service'
import { GamePushService } from './game-push.service'
import { LinkClient } from './link-client'
import { ProtoService } from './proto.service'

interface RunningAccount {
  runner: AccountRunner
  name: string
  disconnectedSince: number
  autoDeleteTriggered: boolean
  wsError: { code: number, message: string, at: number } | null
}

@Injectable()
export class AccountManagerService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger('AccountManager')
  private runners = new Map<string, RunningAccount>()
  private onStatusEventCallback: ((accountId: string, event: StatusEventName, data: any) => void) | null = null
  private onAccountsUpdateCallback: ((data: any) => void) | null = null
  private onLandsUpdateCallback: ((accountId: string, data: any) => void) | null = null
  private onBagUpdateCallback: ((accountId: string, data: any) => void) | null = null
  private onDailyGiftsUpdateCallback: ((accountId: string, data: any) => void) | null = null
  private onFriendsUpdateCallback: ((accountId: string, data: any) => void) | null = null
  private onSettingsUpdateCallback: ((accountId: string, data: any) => void) | null = null
  private linkClient!: LinkClient
  private dedup = new EmitDeduplicator()

  constructor(
    private proto: ProtoService,
    private gameConfig: GameConfigService,
    private store: StoreService,
    private gameLog: GameLogService,
    private gamePush: GamePushService
  ) {}

  setRealtimeCallbacks(callbacks: {
    onStatusEvent?: (accountId: string, event: StatusEventName, data: any) => void
    onLog?: (entry: any) => void
    onAccountLog?: (entry: any) => void
    onAccountsUpdate?: (data: any) => void
    onLandsUpdate?: (accountId: string, data: any) => void
    onBagUpdate?: (accountId: string, data: any) => void
    onDailyGiftsUpdate?: (accountId: string, data: any) => void
    onFriendsUpdate?: (accountId: string, data: any) => void
    onSettingsUpdate?: (accountId: string, data: any) => void
  }) {
    if (callbacks.onStatusEvent)
      this.onStatusEventCallback = callbacks.onStatusEvent
    this.onAccountsUpdateCallback = callbacks.onAccountsUpdate ?? null
    this.onLandsUpdateCallback = callbacks.onLandsUpdate ?? null
    this.onBagUpdateCallback = callbacks.onBagUpdate ?? null
    this.onDailyGiftsUpdateCallback = callbacks.onDailyGiftsUpdate ?? null
    this.onFriendsUpdateCallback = callbacks.onFriendsUpdate ?? null
    this.onSettingsUpdateCallback = callbacks.onSettingsUpdate ?? null
    this.gameLog.setCallbacks({
      onLog: callbacks.onLog ?? undefined,
      onAccountLog: callbacks.onAccountLog ?? undefined
    })
  }

  notifyAccountsUpdate() {
    const data = this.getAccounts()
    if (!this.dedup.hasChanged('accounts', data))
      return
    this.onAccountsUpdateCallback?.(data)
  }

  notifySettingsUpdate(accountId: string) {
    const id = String(accountId || '').trim()
    if (!id)
      return
    const data = {
      intervals: this.store.getIntervals(id),
      plantingStrategy: this.store.getPlantingStrategy(id),
      preferredSeedId: this.store.getPreferredSeed(id),
      friendQuietHours: this.store.getFriendQuietHours(id),
      stealCropBlacklist: this.store.getStealCropBlacklist(id),
      friendBlacklist: this.store.getFriendBlacklist(id),
      automation: this.store.getAutomation(id),
      ui: this.store.getUI(),
      offlineReminder: this.store.getOfflineReminder()
    }
    if (!this.dedup.hasChanged(`settings:${id}`, data))
      return
    this.onSettingsUpdateCallback?.(id, data)
  }

  async onModuleInit() {
    this.linkClient = new LinkClient(this.proto, {
      host: process.env.LINK_HOST || '127.0.0.1',
      port: Number(process.env.LINK_PORT) || 9800
    })

    this.linkClient.on('link_event', ({ accountId, event, data }) => {
      const record = this.runners.get(accountId)
      if (record)
        record.runner.handleLinkEvent(event, data)
    })

    this.linkClient.on('connected', () => this.syncAccountsStateFromLink())

    try {
      await this.linkClient.connect()
      this.logger.log('已连接到 Link 服务')
    } catch (e: any) {
      this.logger.warn(`连接 Link 失败，将后台重试: ${e?.message}`)
    }

    await this.autoStartAccounts()
  }

  async onModuleDestroy() {
    const ids = Array.from(this.runners.keys())
    for (const id of ids) {
      await this.stopAccount(id)
      await this.disconnectFromLink(id)
    }
    this.linkClient?.destroy()
  }

  private async syncAccountsStateFromLink() {
    if (!this.linkClient?.connected)
      return
    for (const [accountId, record] of this.runners) {
      if (!record.runner.isActive())
        continue
      try {
        const meta = await this.linkClient.getAccountStatus(accountId)
        if (meta?.connected && meta.userState) {
          record.runner.handleLinkEvent('connected', meta.userState)
        } else {
          record.runner.handleLinkEvent('disconnected', {})
        }
      } catch {
        record.runner.handleLinkEvent('disconnected', {})
      }
    }
  }

  private async autoStartAccounts() {
    const accounts = this.store.getAllAccounts()
    for (const acc of accounts) {
      if (acc.code && acc.running)
        this.startAccount(acc.id)
    }
  }

  // ========== Account Lifecycle ==========

  startAccount(accountId: string): boolean {
    const id = String(accountId ?? '').trim()
    if (!id)
      return false

    const existing = this.runners.get(id)
    if (existing) {
      if (existing.runner.isActive())
        return false
      this.runners.delete(id)
    }

    const acc = this.store.getAccountById(id)
    if (!acc)
      return false
    if (!acc.code || String(acc.code).trim() === '')
      return false

    const callbacks: AccountRunnerCallbacks = {
      onStatusEvent: (runnerId, event, data, name, callerRunner) => {
        const record = this.runners.get(runnerId)
        if (!record)
          return
        if (callerRunner != null && record.runner !== callerRunner)
          return
        this.handleStatusEvent(runnerId, event, data, name ?? record.name)
      },
      onLog: (entry) => {
        const r = this.runners.get(id)
        this.gameLog.appendLog(id, r?.name ?? acc.name ?? '', entry)
      },
      onKicked: (aid, reason) => this.handleKicked(aid, reason),
      onWsError: (aid, code, message) => this.handleWsError(aid, code, message),
      onStopped: (aid) => {
        const r = this.runners.get(aid)
        if (r && !r.runner.isActive())
          this.runners.delete(aid)
      },
      onLandsUpdate: (aid, data) => this.onLandsUpdateCallback?.(aid, data),
      onBagUpdate: (aid, data) => this.onBagUpdateCallback?.(aid, data),
      onDailyGiftsUpdate: (aid, data) => this.onDailyGiftsUpdateCallback?.(aid, data),
      onFriendsUpdate: (aid, data) => this.onFriendsUpdateCallback?.(aid, data)
    }

    const runner = new AccountRunner(id, this.linkClient, this.proto, this.gameConfig, this.store, callbacks)
    runner.name = acc.name || ''

    const record: RunningAccount = {
      runner,
      name: acc.name || '',
      disconnectedSince: 0,
      autoDeleteTriggered: false,
      wsError: null
    }
    this.runners.set(id, record)
    this.store.setAccountRunning(id, true)

    runner.start({ code: acc.code, platform: acc.platform || 'qq' }).catch((e) => {
      this.logger.error(`账号 ${acc.name} 启动失败: ${e?.message}`)
      this.runners.delete(id)
      this.store.setAccountRunning(id, false)
      this.notifyAccountsUpdate()
    })

    this.gameLog.addAccountLog('start', `启动账号: ${acc.name}`, id, acc.name || '')
    this.notifyAccountsUpdate()
    return true
  }

  async stopAccount(accountId: string): Promise<boolean> {
    const record = this.runners.get(accountId)
    if (!record)
      return false
    const name = record.name
    await record.runner.stop()
    this.runners.delete(accountId)
    this.store.setAccountRunning(accountId, false)

    this.onStatusEventCallback?.(accountId, 'connection', { connected: false, accountName: name })

    this.gameLog.addAccountLog('stop', `停止账号: ${name}`, accountId, name)
    this.notifyAccountsUpdate()
    return true
  }

  /** 通知 Link 端断开该账号的游戏连接，仅 delete/被踢/进程退出 时调用 */
  async disconnectFromLink(accountId: string): Promise<void> {
    await this.linkClient.disconnectAccount(accountId).catch(() => {})
  }

  async restartAccount(accountId: string): Promise<boolean> {
    await this.stopAccount(accountId)
    return this.startAccount(accountId)
  }

  isAccountRunning(accountId: string): boolean {
    return this.runners.has(accountId) && !!this.runners.get(accountId)?.runner.isActive()
  }

  // ========== Event Handlers ==========

  private handleStatusEvent(accountId: string, event: StatusEventName, data: any, _name: string) {
    const record = this.runners.get(accountId)
    if (!record)
      return

    if (event === 'connection') {
      const connected = !!data?.connected
      if (data?.accountName && data.accountName !== '未知' && data.accountName !== '未登录' && record.name !== data.accountName) {
        const oldName = record.name
        record.name = data.accountName
        record.runner.name = data.accountName
        this.store.addOrUpdateAccount({ id: accountId, nick: data.accountName })
        this.logger.log(`已同步账号昵称: ${oldName || 'None'} -> ${data.accountName}`)
        this.gameLog.appendLog(accountId, record.name, {
          msg: `已同步账号昵称: ${oldName || 'None'} -> ${data.accountName}`,
          tag: '系统',
          meta: { module: 'system', event: 'nick_sync' }
        })
      }
      if (connected) {
        record.disconnectedSince = 0
        record.autoDeleteTriggered = false
        record.wsError = null
      } else if (record.runner.isActive()) {
        const now = Date.now()
        if (!record.disconnectedSince)
          record.disconnectedSince = now
        const offlineMs = now - record.disconnectedSince
        const offlineReminder = this.store.getOfflineReminder()
        const autoDeleteMs = (offlineReminder?.offlineDeleteSec || 120) * 1000

        if (!record.autoDeleteTriggered && offlineMs >= autoDeleteMs) {
          record.autoDeleteTriggered = true
          const offlineMin = Math.floor(offlineMs / 60000)
          this.logger.warn(`账号 ${record.name} 持续离线 ${offlineMin} 分钟，自动删除`)
          this.gamePush.triggerOfflineReminder(accountId, record.name, 'offline_timeout', offlineMs)
          this.gameLog.addAccountLog(
            'offline_delete',
            `账号 ${record.name} 持续离线 ${offlineMin} 分钟，已自动删除`,
            accountId,
            record.name
          )
          this.stopAccount(accountId).then(() => this.disconnectFromLink(accountId)).catch(() => {})
          this.store.deleteAccount(accountId)
        }
      }
    }

    if (event === 'profile') {
      const profileName = data?.name
      if (profileName && profileName !== '未知' && profileName !== '未登录' && record.name !== profileName) {
        const oldName = record.name
        record.name = profileName
        record.runner.name = profileName
        this.store.addOrUpdateAccount({ id: accountId, nick: profileName })
        this.logger.log(`已同步账号昵称: ${oldName || 'None'} -> ${profileName}`)
        this.gameLog.appendLog(accountId, record.name, {
          msg: `已同步账号昵称: ${oldName || 'None'} -> ${profileName}`,
          tag: '系统',
          meta: { module: 'system', event: 'nick_sync' }
        })
      }
      const avatarUrl = data?.avatarUrl
      if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim() !== '') {
        const existing = this.store.getAccountById(accountId)
        if (!existing?.avatar || String(existing.avatar).trim() === '') {
          this.store.addOrUpdateAccount({ id: accountId, avatarUrl })
        }
      }
      const openId = data?.openId
      if (openId && typeof openId === 'string' && openId.trim() !== '') {
        const existing = this.store.getAccountById(accountId)
        if (!existing?.uin || String(existing.uin).trim() === '') {
          this.store.addOrUpdateAccount({ id: accountId, uin: openId })
        }
      }
    }

    if (event === 'connection' || event === 'profile')
      this.notifyAccountsUpdate()

    const payload = event === 'connection' ? { ...data, wsError: record.wsError } : data
    this.onStatusEventCallback?.(accountId, event, payload)
  }

  private async handleKicked(accountId: string, reason: string) {
    const record = this.runners.get(accountId)
    if (!record)
      return
    this.logger.warn(`账号 ${record.name} 被踢下线: ${reason}`)
    this.gamePush.triggerOfflineReminder(accountId, record.name, `kickout:${reason}`, 0)
    this.gameLog.addAccountLog('kickout_stop', `账号 ${record.name} 被踢下线，已自动停止`, accountId, record.name)
    await this.stopAccount(accountId).catch(() => {})
    await this.disconnectFromLink(accountId)
  }

  private handleWsError(accountId: string, code: number, message: string) {
    const record = this.runners.get(accountId)
    if (!record)
      return
    record.wsError = { code, message, at: Date.now() }
    if (code === 400) {
      this.gameLog.addAccountLog('ws_400', `账号 ${record.name} 登录失效，请更新 Code`, accountId, record.name)
    }
  }

  // ========== Public API ==========

  getAccounts() {
    const dbAccounts = this.store.getAllAccounts()
    const accounts = dbAccounts.map((acc) => {
      const record = this.runners.get(acc.id)
      const { code, loginType, ...rest } = acc
      return {
        ...rest,
        running: this.isAccountRunning(acc.id),
        connected: !!record?.runner?.isConnected?.(),
        wsError: record?.wsError || null
      }
    })
    return { accounts }
  }

  resolveAccountId(rawRef: string | number): string {
    const ref = String(rawRef ?? '').trim()
    if (!ref)
      return ''
    const accounts = this.store.getAllAccounts()
    const found = accounts.find(a => String(a?.id) === ref || String(a?.uin) === ref || String(a?.qq) === ref)
    return found ? String(found.id) : ref
  }

  setRuntimeAccountName(accountId: string, name: string) {
    const record = this.runners.get(accountId)
    if (record) {
      record.name = name
      record.runner.name = name
    }
  }

  getRunner(accountId: string): AccountRunner | null {
    return this.runners.get(accountId)?.runner || null
  }

  getRunnerOrThrow(accountId: string): AccountRunner {
    const runner = this.getRunner(accountId)
    if (!runner)
      throw new BadRequestException('账号未运行')
    return runner
  }

  getStatus(accountId: string) {
    const record = this.runners.get(accountId)
    if (!record?.runner)
      return null
    const snapshot = record.runner.getStatusSnapshot()
    return { accountId, accountName: record.name, ...snapshot }
  }

  getLogs(
    accountId: string,
    options?: { keyword?: string, limit?: number, module?: string, event?: string, isWarn?: boolean }
  ) {
    return this.gameLog.getLogs(accountId, options)
  }

  getAccountLogs(limit = 50) {
    return this.gameLog.getAccountLogs(limit)
  }

  addAccountLog(action: string, msg: string, accountId: string, accountName: string, extra?: any) {
    this.gameLog.addAccountLog(action, msg, accountId, accountName, extra)
  }

  broadcastConfig(accountId: string) {
    const runner = this.getRunner(accountId)
    if (!runner)
      return
    const snapshot = this.store.getConfigSnapshot(accountId)
    runner.applyConfig(snapshot)
  }
}
