import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { LinkEventName, LinkUserState } from '../game/types'
import type { RunningAccount } from './account-registry.service'
import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'
import { GameLogService } from '../game/game-log.service'
import { AccountConfigService } from '../store/account-config.service'
import { AccountRepository } from '../store/account-repository'
import { LinkClientService } from '../transport/link-client.service'
import { AccountLifecycleLinkOps } from './account-lifecycle-link'
import { AccountRegistryService } from './account-registry.service'
import {
  ACCOUNT_STARTED_EVENT,
  ACCOUNT_STOPPED_EVENT
} from './account.events'
import { AccountRunnerFactory } from './runner/account-runner.factory'

@Injectable()
export class AccountLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountLifecycleService.name)
  private readonly linkOps: AccountLifecycleLinkOps

  constructor(
    private readonly accountRepo: AccountRepository,
    private readonly accountConfig: AccountConfigService,
    private readonly gameLog: GameLogService,
    private readonly registry: AccountRegistryService,
    private readonly linkClient: LinkClientService,
    private readonly eventEmitter: EventEmitter2,
    private readonly runnerFactory: AccountRunnerFactory
  ) {
    this.linkOps = new AccountLifecycleLinkOps({
      logger: this.logger,
      accountRepo: this.accountRepo,
      gameLog: this.gameLog,
      registry: this.registry,
      linkClient: this.linkClient,
      runnerFactory: this.runnerFactory,
      stopAccount: accountId => this.stopAccount(accountId)
    })
  }

  async onModuleInit() {
    const autoStartIds = this.accountRepo.getAllAccounts()
      .filter(account => !!account?.code && !!account?.running)
      .map(account => String(account.id))

    for (const account of this.accountRepo.getAllAccounts())
      this.accountRepo.setAccountRunning(String(account.id), false)

    for (const accountId of autoStartIds) {
      try {
        await this.startAccount(accountId)
      } catch (error: any) {
        this.logger.warn(`自动恢复账号失败 [${accountId}]: ${error?.message || error}`)
      }
    }
  }

  async onModuleDestroy() {
    const ids = this.registry.getAllIds()
    for (const id of ids) {
      await this.stopAccount(id).catch(() => {})
      await this.disconnectFromLink(id).catch(() => {})
    }
  }

  @OnEvent('link.account_event')
  handleLinkAccountEvent(payload: { accountId: string, event: LinkEventName, data: any }) {
    this.linkOps.handleLinkAccountEvent(payload)
  }

  @OnEvent('link.connected')
  async handleLinkConnected() {
    await this.linkOps.syncAccountsStateFromLink()
  }

  async syncGhostConnections(): Promise<void> {
    await this.linkOps.syncGhostConnections()
  }

  async startAccount(accountId: string): Promise<boolean> {
    const id = String(accountId ?? '').trim()
    if (!id)
      return false

    const existing = this.registry.get(id)
    if (existing) {
      if (existing.runner.isActive())
        return false
      this.registry.unregister(id)
    }

    const account = this.accountRepo.getAccountById(id)
    if (!account?.code || String(account.code).trim() === '')
      return false

    await this.syncGhostConnections()

    const currentCode = String(account.code).trim()
    try {
      const meta = await this.linkClient.getAccountStatus(id)
      if (meta?.connected) {
        const lastUsed = this.registry.getLastCode(id)
        if (lastUsed !== undefined && lastUsed !== currentCode) {
          this.logger.log(`账号 ${id} 登录码已变更，先断开联机连接再重连`)
          await this.disconnectFromLink(id)
          this.registry.deleteLastCode(id)
        }
      }
    } catch {
      // 忽略联机状态探测异常，交由 runner 自行决定连接方式
    }

    const runner = this.runnerFactory.create(id)
    runner.name = account.name || ''

    const record: RunningAccount = {
      runner,
      name: account.name || '',
      disconnectedSince: 0,
      autoDeleteTriggered: false,
      wsError: null
    }

    this.registry.register(id, record)
    this.accountRepo.setAccountRunning(id, true)

    runner.start(this.runnerFactory.createStartConfig(id, account)).catch((error: any) => {
      this.logger.error(`账号 ${account.name || id} 启动失败: ${error?.message || error}`)
      this.registry.unregister(id)
      this.accountRepo.setAccountRunning(id, false)
      this.eventEmitter.emit(ACCOUNT_STOPPED_EVENT, { accountId: id, accountName: account.name || '' })
    })

    this.gameLog.addAccountLog('start', `启动账号: ${account.name}`, id, account.name || '')
    this.eventEmitter.emit(ACCOUNT_STARTED_EVENT, { accountId: id, accountName: account.name || '' })
    return true
  }

  async stopAccount(accountId: string): Promise<boolean> {
    const id = String(accountId ?? '').trim()
    const record = this.registry.get(id)
    if (!record)
      return false

    const accountName = record.name
    await record.runner.stop()
    this.registry.unregister(id)
    this.accountRepo.setAccountRunning(id, false)
    this.gameLog.addAccountLog('stop', `停止账号: ${accountName}`, id, accountName)
    this.eventEmitter.emit(ACCOUNT_STOPPED_EVENT, { accountId: id, accountName })
    await this.syncGhostConnections()
    return true
  }

  async restartAccount(accountId: string): Promise<boolean> {
    await this.stopAccount(accountId)
    return this.startAccount(accountId)
  }

  async reconnectAllRunningAccounts(): Promise<void> {
    const runningIds = this.registry.getAllIds().filter(id => this.isAccountRunning(id))
    await this.reconnectAccounts(runningIds)
  }

  async reconnectAccounts(accountIds: string[]): Promise<void> {
    const ids = [...new Set(accountIds.map(id => String(id).trim()).filter(Boolean))]
      .filter(id => this.isAccountRunning(id))

    for (const id of ids) {
      try {
        await this.restartAccount(id)
      } catch (error: any) {
        this.logger.warn(`重启账号失败 [${id}]: ${error?.message || error}`)
      }
    }
  }

  async disconnectFromLink(accountId: string): Promise<void> {
    await this.linkOps.disconnectFromLink(accountId)
  }

  async rebindLinkConnection(fromId: string, toId: string): Promise<void> {
    await this.linkOps.rebindLinkConnection(fromId, toId)
  }

  async probeAccountByCode(code: string, platform: string): Promise<{ openId: string, name: string, level: number } | null> {
    return this.linkOps.probeAccountByCode(code, platform)
  }

  async connectForImport(code: string, platform: string): Promise<{ tempId: string, userState: LinkUserState | undefined }> {
    return this.linkOps.connectForImport(code, platform)
  }

  resolveAccountId(rawRef: string | number): string {
    const ref = String(rawRef ?? '').trim()
    if (!ref)
      return ''
    const found = this.accountRepo.getAllAccounts().find(account =>
      String(account?.id) === ref
      || String(account?.uin) === ref
      || String(account?.qq) === ref
    )
    return found ? String(found.id) : ref
  }

  setRuntimeAccountName(accountId: string, name: string) {
    const record = this.registry.get(accountId)
    if (!record)
      return
    record.name = name
    record.runner.name = name
  }

  applyConfig(accountId: string) {
    const runner = this.registry.getRunner(accountId)
    if (!runner)
      return

    const revision = Date.now()
    runner.applyConfig({
      ...this.accountConfig.getConfigSnapshot(accountId),
      __revision: revision
    })
  }

  isAccountRunning(accountId: string): boolean {
    return this.registry.isRunning(accountId)
  }

  getRunner(accountId: string) {
    return this.registry.getRunner(accountId)
  }

  getRunnerOrThrow(accountId: string) {
    return this.registry.getRunnerOrThrow(accountId)
  }

  async mergeDuplicateAccountsByUinPlatform(accountId: string, openId: string): Promise<void> { await this.linkOps.mergeDuplicateAccountsByUinPlatform(accountId, openId) }
}
