import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { AccountRunnerCallbacks, StatusEventName } from './account-runner'
import type { AccountListItem, AccountLogEntry, ConnectionEventData, LinkEventName, LinkUserState, PersistedLogEntry, ProfileEventData, StatusEventData } from './types'
import process from 'node:process'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { StoreService } from '../store/store.service'
import { AccountRunner } from './account-runner'
import { GameConfigService } from './game-config.service'
import { GameLogService } from './game-log.service'
import { GamePushService } from './game-push.service'
import { LinkClient } from './link-client'
import { AnalyticsWorker } from './services/analytics.worker'

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
  /** 每个账号上次用于建立 link 连接的 code，用于比对避免误用新 code 重连（code 用一次即失效） */
  private lastCodeUsedForConnection = new Map<string, string>()
  private onStatusEventCallback: ((accountId: string, event: StatusEventName, data: StatusEventData) => void) | null = null
  private onAccountsUpdateCallback: ((data: { accounts: AccountListItem[] }) => void) | null = null
  private onLandsUpdateCallback: ((accountId: string, data: unknown) => void) | null = null
  private onBagUpdateCallback: ((accountId: string, data: unknown) => void) | null = null
  private onDailyGiftsUpdateCallback: ((accountId: string, data: unknown) => void) | null = null
  private onFriendsUpdateCallback: ((accountId: string, data: unknown) => void) | null = null
  private onAlmanacUpdateCallback: ((accountId: string, data: unknown) => void) | null = null
  private onStrategyUpdateCallback: ((accountId: string, data: unknown) => void) | null = null
  private onPanelUpdateCallback: ((data: unknown) => void) | null = null
  private linkClient!: LinkClient

  constructor(
    private gameConfig: GameConfigService,
    private store: StoreService,
    private gameLog: GameLogService,
    private gamePush: GamePushService
  ) {
    this.statusEventHandlers = this.buildStatusEventHandlers()
  }

  setRealtimeCallbacks(callbacks: {
    onStatusEvent?: (accountId: string, event: StatusEventName, data: StatusEventData) => void
    onLog?: (entry: PersistedLogEntry) => void
    onAccountLog?: (entry: AccountLogEntry) => void
    onAccountsUpdate?: (data: { accounts: AccountListItem[] }) => void
    onLandsUpdate?: (accountId: string, data: unknown) => void
    onBagUpdate?: (accountId: string, data: unknown) => void
    onDailyGiftsUpdate?: (accountId: string, data: unknown) => void
    onFriendsUpdate?: (accountId: string, data: unknown) => void
    onAlmanacUpdate?: (accountId: string, data: unknown) => void
    onStrategyUpdate?: (accountId: string, data: unknown) => void
    onPanelUpdate?: (data: unknown) => void
  }) {
    if (callbacks.onStatusEvent)
      this.onStatusEventCallback = callbacks.onStatusEvent
    this.onAccountsUpdateCallback = callbacks.onAccountsUpdate ?? null
    this.onLandsUpdateCallback = callbacks.onLandsUpdate ?? null
    this.onBagUpdateCallback = callbacks.onBagUpdate ?? null
    this.onDailyGiftsUpdateCallback = callbacks.onDailyGiftsUpdate ?? null
    this.onFriendsUpdateCallback = callbacks.onFriendsUpdate ?? null
    this.onAlmanacUpdateCallback = callbacks.onAlmanacUpdate ?? null
    this.onStrategyUpdateCallback = callbacks.onStrategyUpdate ?? null
    this.onPanelUpdateCallback = callbacks.onPanelUpdate ?? null
    this.gameLog.setCallbacks({
      onLog: callbacks.onLog ?? undefined,
      onAccountLog: callbacks.onAccountLog ?? undefined
    })
  }

  notifyAccountsUpdate() {
    const data = this.getAccounts()
    this.onAccountsUpdateCallback?.(data)
  }

  notifyStrategyUpdate(accountId: string) {
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
      automation: this.store.getAutomation(id)
    }
    this.onStrategyUpdateCallback?.(id, data)
  }

  notifyPanelUpdate() {
    const data = {
      ui: this.store.getUI(),
      offlineReminder: this.store.getOfflineReminder(),
      runtimeClient: this.store.getRuntimeClient()
    }
    this.onPanelUpdateCallback?.(data)
  }

  async reconnectAllRunningAccounts(): Promise<void> {
    const runningIds = [...this.runners.keys()].filter(id => this.isAccountRunning(id))
    for (const id of runningIds) {
      try {
        await this.restartAccount(id)
      } catch (e: any) {
        this.logger.warn(`重启账号 ${id} 失败: ${e?.message}`)
      }
    }
  }

  async onModuleInit() {
    this.linkClient = new LinkClient({
      host: process.env.LINK_HOST || '127.0.0.1',
      port: Number(process.env.LINK_PORT) || 9800
    })

    this.linkClient.on('link_event', ({ accountId, event, data }: { accountId: string, event: LinkEventName, data: any }) => {
      if (event === 'connected') {
        const acc = this.store.getAccountById(accountId)
        if (acc?.code != null)
          this.lastCodeUsedForConnection.set(accountId, String(acc.code).trim())
      }
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

    const allAccounts = this.store.getAllAccounts()
    for (const acc of allAccounts)
      this.store.setAccountRunning(String(acc.id), false)
    await this.autoStartAccounts()
  }

  async onModuleDestroy() {
    const ids = [...this.runners.keys()]
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
        await this.startAccount(acc.id)
    }
  }

  // ========== Account Lifecycle ==========

  /**
   * 同步 link 侧连接与 core 侧账号：断开 link 上「不在 store 中」的账号连接（幽灵连接），
   * 避免误清其它账号。应在启动/停止/删除/更新时调用。
   */
  async syncGhostConnections(): Promise<void> {
    if (!this.linkClient?.connected)
      return
    try {
      const list = await this.linkClient.listConnections()
      const storeIds = new Set(this.store.getAllAccounts().map(a => String(a.id)))
      for (const conn of list || []) {
        const aid = String(conn.accountId ?? '').trim()
        if (!aid)
          continue
        // 跳过导入/探测使用的临时连接，由各自流程管理生命周期
        if (aid.startsWith('import_') || aid.startsWith('probe_'))
          continue
        if (!storeIds.has(aid)) {
          this.logger.log(`清理幽灵连接: ${aid}（账号已不在 store 中）`)
          await this.disconnectFromLink(aid)
        }
      }
    } catch (e: any) {
      this.logger.warn(`同步 link 连接列表失败: ${e?.message}`)
    }
  }

  /**
   * 启动账号。会先比对 code：若 link 已有连接但当前 store 的 code 与上次建立连接用的 code 不一致，
   * 先断开该账号的 link 再重连（避免误用新 code 导致一次失效）；不会对其它账号做断开。
   */
  async startAccount(accountId: string): Promise<boolean> {
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

    await this.syncGhostConnections()

    const currentCode = String(acc.code).trim()
    try {
      const meta = await this.linkClient.getAccountStatus(id)
      if (meta?.connected) {
        const lastUsed = this.lastCodeUsedForConnection.get(id)
        if (lastUsed !== undefined && lastUsed !== currentCode) {
          this.logger.log(`账号 ${id} code 已变更，先断开 link 再使用新 code 重连`)
          await this.disconnectFromLink(id)
          this.lastCodeUsedForConnection.delete(id)
        }
      }
    } catch {
      // 无法获取 link 状态时继续启动，runner 内会决定是否用 code 连接
    }

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
        if (r && !r.runner.isActive()) {
          this.runners.delete(aid)
          this.store.setAccountRunning(aid, false)
          this.notifyAccountsUpdate()
        }
      },
      onLandsUpdate: (aid, data) => this.onLandsUpdateCallback?.(aid, data),
      onBagUpdate: (aid, data) => this.onBagUpdateCallback?.(aid, data),
      onDailyGiftsUpdate: (aid, data) => this.onDailyGiftsUpdateCallback?.(aid, data),
      onFriendsUpdate: (aid, data) => this.onFriendsUpdateCallback?.(aid, data),
      onAlmanacUpdate: (aid, data) => this.onAlmanacUpdateCallback?.(aid, data)
    }

    const runner = new AccountRunner(id, this.linkClient, this.gameConfig, this.store, callbacks)
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

  /**
   * 停止账号：仅暂停 core 与 link 的协作（移除 runner），不通知 link 断开连接。
   * link 侧连接保留，下次启动可复用，避免重复消耗 code。
   */
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
    await this.syncGhostConnections()
    return true
  }

  /** 通知 Link 端断开该账号的游戏连接；仅 删除账号/被踢/进程退出 时调用，停止账号不调用 */
  async disconnectFromLink(accountId: string): Promise<void> {
    await this.linkClient.disconnectAccount(accountId).catch(e => this.logger.warn(`断开 link 连接失败 [${accountId}]: ${e?.message}`))
    this.lastCodeUsedForConnection.delete(accountId)
  }

  /** 将已存在的 link 连接从 fromId 改绑到 toId，并迁移最近使用的 code 记录 */
  async rebindLinkConnection(fromId: string, toId: string): Promise<void> {
    const from = String(fromId || '').trim()
    const to = String(toId || '').trim()
    if (!from || !to || from === to)
      return
    await this.linkClient.rebindAccount(from, to)
    const last = this.lastCodeUsedForConnection.get(from)
    if (last !== undefined) {
      this.lastCodeUsedForConnection.set(to, last)
      this.lastCodeUsedForConnection.delete(from)
    }
  }

  async restartAccount(accountId: string): Promise<boolean> {
    await this.stopAccount(accountId)
    return await this.startAccount(accountId)
  }

  /**
   * 通过 code 连接 link 服务，获取用户信息（用于导入账号前的身份验证）
   */
  async probeAccountByCode(code: string, platform: string): Promise<{ openId: string, name: string, level: number } | null> {
    const tempId = `probe_${Date.now()}`
    try {
      const runtimeCfg = this.store.getRuntimeClient()
      const userState = await this.linkClient.connectAccount(tempId, code, platform, runtimeCfg)
      if (!userState?.openId) {
        return null
      }
      return {
        openId: userState.openId,
        name: userState.name || '',
        level: Number(userState.level) || 0
      }
    } catch (e) {
      this.logger.warn(`probeAccountByCode 失败: ${e}`)
      return null
    } finally {
      // best-effort cleanup: 探测连接失败时也需要清理临时连接
      await this.linkClient.disconnectAccount(tempId).catch(() => {})
    }
  }

  /**
   * 通过 code 建立临时连接用于导入，返回 tempId 和用户信息。
   * 调用方需负责后续 rebind 或 disconnect。
   */
  async connectForImport(code: string, platform: string): Promise<{ tempId: string, userState: LinkUserState | undefined }> {
    const tempId = `import_${Date.now()}`
    const runtimeCfg = this.store.getRuntimeClient()
    const userState = await this.linkClient.connectAccount(tempId, code, platform, runtimeCfg)
    return { tempId, userState }
  }

  isAccountRunning(accountId: string): boolean {
    return this.runners.has(accountId) && !!this.runners.get(accountId)?.runner.isActive()
  }

  // ========== Event Handlers ==========

  /** 同步账号昵称（connection/profile 事件共用） */
  private syncAccountNickname(record: RunningAccount, accountId: string, newName: string) {
    if (!newName || newName === '未知' || newName === '未登录' || record.name === newName)
      return
    const oldName = record.name
    record.name = newName
    record.runner.name = newName
    this.store.addOrUpdateAccount({ id: accountId, nick: newName })
    this.logger.log(`已同步账号昵称: ${oldName || 'None'} -> ${newName}`)
    this.gameLog.appendLog(accountId, record.name, {
      msg: `已同步账号昵称: ${oldName || 'None'} -> ${newName}`,
      tag: '系统',
      meta: { module: 'system', event: 'nick_sync' }
    })
    this.notifyAccountsUpdate()
  }

  private statusEventHandlers: Partial<Record<StatusEventName, (record: RunningAccount, accountId: string, data: StatusEventData) => void>> = {}

  private buildStatusEventHandlers(): Partial<Record<StatusEventName, (record: RunningAccount, accountId: string, data: StatusEventData) => void>> {
    return {
      connection: (record, accountId, data) => {
        const connData = data as ConnectionEventData
        const connected = !!connData.connected
        this.syncAccountNickname(record, accountId, connData.accountName)
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
          const autoDeleteMs = (offlineReminder?.offlineDeleteSec || 9_999_999_999) * 1000

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
            this.stopAccount(accountId).then(() => this.disconnectFromLink(accountId)).catch(e => this.logger.warn(`自动删除离线账号失败 [${accountId}]: ${e?.message}`))
            this.store.deleteAccount(accountId)
          }
        }
      },
      profile: (record, accountId, data) => {
        const profData = data as ProfileEventData
        this.syncAccountNickname(record, accountId, profData.name)
        const avatarUrl = profData.avatarUrl
        if (avatarUrl && avatarUrl.trim() !== '') {
          this.store.addOrUpdateAccount({ id: accountId, avatar: avatarUrl })
          this.notifyAccountsUpdate()
        }
        const openId = profData.openId
        if (openId && openId.trim() !== '') {
          const existing = this.store.getAccountById(accountId)
          if (!existing?.uin || String(existing.uin).trim() === '') {
            this.store.addOrUpdateAccount({ id: accountId, uin: openId })
          }
          // 登录后：按 uin + platform 去重，避免同一账号因多次导入产生多条记录
          this.mergeDuplicateAccountsByUinPlatform(accountId, openId).catch(e => this.logger.warn(`合并重复账号失败: ${e?.message}`))
        }
      }
    }
  }

  /**
   * 按 uin + platform 合并重复账号：
   * - 以当前登录账号 accountId 为主
   * - 删除其它拥有相同 uin + platform 的账号记录（包括其配置）
   */
  private async mergeDuplicateAccountsByUinPlatform(accountId: string, openId: string): Promise<void> {
    const uin = String(openId || '').trim()
    const id = String(accountId || '').trim()
    if (!uin || !id)
      return

    const current = this.store.getAccountById(id)
    if (!current)
      return
    const platform = String(current.platform || 'qq')

    const all = this.store.getAllAccounts()
    const duplicates = all.filter(a =>
      String(a.uin || '').trim() === uin
      && String(a.platform || 'qq') === platform
    )

    if (duplicates.length <= 1)
      return

    for (const acc of duplicates) {
      const dupId = String(acc.id)
      if (dupId === id)
        continue
      this.logger.log(`合并重复账号: ${dupId} -> ${id} (uin=${uin}, platform=${platform})`)
      await this.stopAccount(dupId).catch(e => this.logger.warn(`停止重复账号 ${dupId} 失败: ${e?.message}`))
      await this.disconnectFromLink(dupId).catch(e => this.logger.warn(`断开重复账号 ${dupId} 失败: ${e?.message}`))
      this.store.deleteAccount(dupId)
      this.gameLog.deleteAccountLogs(dupId)
    }

    this.notifyAccountsUpdate()
    await this.syncGhostConnections().catch(e => this.logger.warn(`同步幽灵连接失败: ${e?.message}`))
  }

  private handleStatusEvent(accountId: string, event: StatusEventName, data: StatusEventData, _name: string) {
    const record = this.runners.get(accountId)
    if (!record)
      return

    const handler = this.statusEventHandlers[event]
    if (handler)
      handler(record, accountId, data)

    if (event === 'connection' || event === 'profile')
      this.notifyAccountsUpdate()

    if (event === 'connection') {
      const connPayload: ConnectionEventData = { ...(data as ConnectionEventData), wsError: record.wsError }
      this.onStatusEventCallback?.(accountId, event, connPayload)
    } else {
      this.onStatusEventCallback?.(accountId, event, data)
    }
  }

  private async handleKicked(accountId: string, reason: string) {
    const record = this.runners.get(accountId)
    if (!record)
      return
    this.logger.warn(`账号 ${record.name} 被踢下线: ${reason}`)
    this.gamePush.triggerOfflineReminder(accountId, record.name, `kickout:${reason}`, 0)
    this.gameLog.addAccountLog('kickout_stop', `账号 ${record.name} 被踢下线，已自动停止`, accountId, record.name)
    await this.stopAccount(accountId).catch(e => this.logger.warn(`停止被踢账号 ${accountId} 失败: ${e?.message}`))
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

  /** 获取作物分析排行（仅依赖配置，不依赖账号是否运行） */
  getAnalytics(sortBy: string): Record<string, unknown>[] {
    const worker = new AnalyticsWorker(this.gameConfig)
    return worker.getPlantRankings(sortBy)
  }

  getAlmanac(accountId: string, options?: { refresh?: boolean }) {
    const runner = this.getRunnerOrThrow(accountId)
    return runner.getAlmanac(!!options?.refresh)
  }

  claimAlmanacRewards(accountId: string) {
    const runner = this.getRunnerOrThrow(accountId)
    return runner.claimAlmanacRewards()
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

  addAccountLog(action: string, msg: string, accountId: string, accountName: string, extra?: Record<string, unknown>) {
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
