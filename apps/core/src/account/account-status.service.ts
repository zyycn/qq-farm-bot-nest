import type { OnModuleInit } from '@nestjs/common'
import type { AccountLogEntry, ConnectionEventData, PersistedLogEntry } from '../game/types'
import type { AccountDataEventPayload, AccountKickEventPayload, AccountLogEventPayload, AccountPushEventPayload, AccountStatusEventPayload, AccountWsErrorEventPayload } from './account.events'
import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'
import {
  ACCOUNTS_UPDATE,
  ALMANAC_UPDATE,
  BAG_UPDATE,
  DAILY_GIFTS_UPDATE,
  FRIENDS_UPDATE,
  LANDS_UPDATE,
  PANEL_UPDATE,
  STRATEGY_UPDATE
} from '@qq-farm/shared'
import { GameConfigService } from '../game/game-config.service'
import { GameLogService } from '../game/game-log.service'
import { GamePushService } from '../game/game-push.service'
import { AnalyticsWorker } from '../game/workers/analytics.worker'
import { StoreService } from '../store/store.service'
import { AccountLifecycleService } from './account-lifecycle.service'
import { AccountRegistryService } from './account-registry.service'
import { buildAccountStatusEventHandlers } from './account-status-handlers'
import {
  ACCOUNT_DATA_ACCOUNTS_EVENT,
  ACCOUNT_DATA_ALMANAC_EVENT,
  ACCOUNT_DATA_BAG_EVENT,
  ACCOUNT_DATA_DAILY_GIFTS_EVENT,
  ACCOUNT_DATA_FRIENDS_EVENT,
  ACCOUNT_DATA_LANDS_EVENT,
  ACCOUNT_DATA_PANEL_EVENT,
  ACCOUNT_DATA_STRATEGY_EVENT,
  ACCOUNT_KICKED_EVENT,
  ACCOUNT_LOG_ACTION_EVENT,
  ACCOUNT_LOG_EVENT,
  ACCOUNT_PUSH_EVENT,
  ACCOUNT_STARTED_EVENT,
  ACCOUNT_STATUS_EVENT,
  ACCOUNT_STOPPED_EVENT,
  ACCOUNT_WS_ERROR_EVENT

} from './account.events'

@Injectable()
export class AccountStatusService implements OnModuleInit {
  private readonly logger = new Logger(AccountStatusService.name)
  private readonly statusEventHandlers: ReturnType<typeof buildAccountStatusEventHandlers>

  constructor(
    private readonly gameConfig: GameConfigService,
    private readonly store: StoreService,
    private readonly gameLog: GameLogService,
    private readonly gamePush: GamePushService,
    private readonly registry: AccountRegistryService,
    private readonly lifecycle: AccountLifecycleService,
    private readonly eventEmitter: EventEmitter2
  ) {
    this.statusEventHandlers = buildAccountStatusEventHandlers({
      logger: this.logger,
      store: this.store,
      gameLog: this.gameLog,
      gamePush: this.gamePush,
      lifecycle: this.lifecycle,
      notifyAccountsUpdate: () => this.notifyAccountsUpdate()
    })
  }

  onModuleInit() {
    this.gameLog.setCallbacks({
      onLog: entry => this.pushLog(entry),
      onAccountLog: entry => this.forwardAccountLog(entry)
    })
  }

  getAccounts() {
    return {
      accounts: this.store.getAllAccounts().map((account) => {
        const record = this.registry.get(String(account.id))
        const { code, loginType, ...rest } = account
        return {
          ...rest,
          running: this.registry.isRunning(String(account.id)),
          connected: !!record?.runner?.isConnected?.(),
          wsError: record?.wsError || null
        }
      })
    }
  }

  getStatus(accountId: string) {
    const record = this.registry.get(accountId)
    if (!record?.runner)
      return null
    return {
      accountId,
      accountName: record.name,
      ...record.runner.getStatusSnapshot()
    }
  }

  getLogs(accountId: string, options?: { keyword?: string, limit?: number, module?: string, event?: string, isWarn?: boolean }) {
    return this.gameLog.getLogs(accountId, options)
  }

  getAccountLogs(limit = 50) {
    return this.gameLog.getAccountLogs(limit)
  }

  getAnalytics(sortBy: string): Record<string, unknown>[] {
    return new AnalyticsWorker(this.gameConfig).getPlantRankings(sortBy)
  }

  getAlmanac(accountId: string, options?: { refresh?: boolean }) {
    return this.registry.getRunnerOrThrow(accountId).getAlmanac(!!options?.refresh)
  }

  claimAlmanacRewards(accountId: string) {
    return this.registry.getRunnerOrThrow(accountId).claimAlmanacRewards()
  }

  notifyAccountsUpdate() {
    this.eventEmitter.emit(ACCOUNT_DATA_ACCOUNTS_EVENT, this.getAccounts())
  }

  notifyPanelUpdate() {
    this.eventEmitter.emit(ACCOUNT_DATA_PANEL_EVENT, {
      ui: this.store.getUI(),
      offlineReminder: this.store.getOfflineReminder(),
      remoteLoginKey: this.store.getRemoteLoginKey(),
      defaultDeviceProfileId: this.store.getDefaultDeviceProfileId()
    })
  }

  notifyStrategyUpdate(accountId: string) {
    const id = String(accountId || '').trim()
    if (!id)
      return
    this.eventEmitter.emit(ACCOUNT_DATA_STRATEGY_EVENT, {
      accountId: id,
      data: this.getStrategyPayload(id)
    })
  }

  @OnEvent(ACCOUNT_LOG_EVENT)
  handleRunnerLog(payload: AccountLogEventPayload) {
    const accountName = this.registry.get(payload.accountId)?.name ?? payload.accountName ?? ''
    this.gameLog.appendLog(payload.accountId, accountName, payload.entry)
  }

  @OnEvent(ACCOUNT_STATUS_EVENT)
  handleStatusEvent(payload: AccountStatusEventPayload) {
    const record = this.registry.get(payload.accountId)
    if (!record)
      return

    const handler = this.statusEventHandlers[payload.event]
    if (handler)
      Promise.resolve(handler(record, payload.accountId, payload.data)).catch(error => this.logger.warn(`状态事件处理失败: ${error?.message || error}`))

    if (payload.event === 'connection' || payload.event === 'profile')
      this.notifyAccountsUpdate()

    const route = `accounts.${payload.event}`
    this.emitPush({
      target: 'event',
      accountId: payload.accountId,
      route,
      data: payload.event === 'connection'
        ? {
            ...(payload.data as ConnectionEventData),
            wsError: record.wsError
          }
        : payload.data
    })
  }

  @OnEvent(ACCOUNT_STARTED_EVENT)
  handleStarted() {
    this.notifyAccountsUpdate()
  }

  @OnEvent(ACCOUNT_STOPPED_EVENT)
  handleStopped() {
    this.notifyAccountsUpdate()
  }

  @OnEvent(ACCOUNT_WS_ERROR_EVENT)
  async handleWsError(payload: AccountWsErrorEventPayload) {
    const record = this.registry.get(payload.accountId)
    if (!record)
      return

    record.wsError = { code: payload.code, message: payload.message, at: Date.now() }
    if (payload.code === 400) {
      this.gameLog.addAccountLog('ws_400', `账号 ${record.name} 登录失效，请更新登录码`, payload.accountId, record.name)
      await this.lifecycle.stopAccount(payload.accountId).catch(error => this.logger.warn(`停止失效账号失败 [${payload.accountId}]: ${error?.message || error}`))
    }
  }

  @OnEvent(ACCOUNT_KICKED_EVENT)
  async handleKicked(payload: AccountKickEventPayload) {
    const record = this.registry.get(payload.accountId)
    if (!record)
      return

    this.logger.warn(`账号 ${record.name} 被踢下线: ${payload.reason}`)
    await this.gamePush.triggerOfflineReminder(payload.accountId, record.name, `kickout:${payload.reason}`, 0)
    this.gameLog.addAccountLog('kickout_stop', `账号 ${record.name} 被踢下线，已自动停止`, payload.accountId, record.name)
    await this.lifecycle.stopAccount(payload.accountId).catch(error => this.logger.warn(`停止被踢账号失败 [${payload.accountId}]: ${error?.message || error}`))
    await this.lifecycle.disconnectFromLink(payload.accountId).catch(error => this.logger.warn(`断开被踢账号失败 [${payload.accountId}]: ${error?.message || error}`))
  }

  @OnEvent(ACCOUNT_DATA_ACCOUNTS_EVENT)
  handleAccountsUpdate(payload: { accounts: unknown[] }) {
    this.emitPush({ target: 'broadcast', route: ACCOUNTS_UPDATE, data: payload })
  }

  @OnEvent(ACCOUNT_DATA_PANEL_EVENT)
  handlePanelUpdate(payload: unknown) {
    this.emitPush({ target: 'broadcast', route: PANEL_UPDATE, data: payload })
  }

  @OnEvent(ACCOUNT_DATA_STRATEGY_EVENT)
  handleStrategyUpdate(payload: AccountDataEventPayload) {
    this.emitPush({ target: 'event', accountId: payload.accountId, route: STRATEGY_UPDATE, data: payload.data })
  }

  @OnEvent(ACCOUNT_DATA_LANDS_EVENT)
  handleLandsUpdate(payload: AccountDataEventPayload) {
    this.emitPush({ target: 'event', accountId: payload.accountId, route: LANDS_UPDATE, data: payload.data })
  }

  @OnEvent(ACCOUNT_DATA_BAG_EVENT)
  handleBagUpdate(payload: AccountDataEventPayload) {
    this.emitPush({ target: 'event', accountId: payload.accountId, route: BAG_UPDATE, data: payload.data })
  }

  @OnEvent(ACCOUNT_DATA_DAILY_GIFTS_EVENT)
  handleDailyGiftsUpdate(payload: AccountDataEventPayload) {
    this.emitPush({ target: 'event', accountId: payload.accountId, route: DAILY_GIFTS_UPDATE, data: payload.data })
  }

  @OnEvent(ACCOUNT_DATA_FRIENDS_EVENT)
  handleFriendsUpdate(payload: AccountDataEventPayload) {
    this.emitPush({ target: 'event', accountId: payload.accountId, route: FRIENDS_UPDATE, data: payload.data })
  }

  @OnEvent(ACCOUNT_DATA_ALMANAC_EVENT)
  handleAlmanacUpdate(payload: AccountDataEventPayload) {
    this.emitPush({ target: 'event', accountId: payload.accountId, route: ALMANAC_UPDATE, data: payload.data })
  }

  private getStrategyPayload(accountId: string) {
    const config = this.store.getAccountConfig(accountId)
    return {
      intervals: config.intervals,
      plantingStrategy: config.plantingStrategy,
      preferredSeedId: config.preferredSeedId,
      bagSeedPriority: config.bagSeedPriority,
      friendQuietHours: config.friendQuietHours,
      stealCropBlacklist: config.stealCropBlacklist,
      friendBlacklist: config.friendBlacklist,
      automation: config.automation,
      fertilizer: config.fertilizer,
      fertilizerLandTypes: config.fertilizerLandTypes,
      fertilizerMultiSeason: config.fertilizerMultiSeason,
      fertilizerBuy: config.fertilizerBuy,
      deviceProfileId: config.deviceProfileId
    }
  }

  private pushLog(entry: PersistedLogEntry) {
    const accountId = String(entry?.accountId || '').trim()
    if (!accountId)
      return
    this.emitPush({ target: 'event', accountId, route: 'logs.append', data: entry })
  }

  private forwardAccountLog(entry: AccountLogEntry) {
    if (!entry)
      return
    void ACCOUNT_LOG_ACTION_EVENT
  }

  private emitPush(payload: AccountPushEventPayload) {
    this.eventEmitter.emit(ACCOUNT_PUSH_EVENT, payload)
  }
}
