import type { Logger } from '@nestjs/common'
import type { AccountRegistryService } from '@/modules/account/application/account-registry.service'
import type { AccountRunnerFactory } from '@/modules/account/application/runner/account-runner.factory'
import type { AccountRepository } from '@/modules/account/persistence/account-repository'
import type { GameLogService } from '@/modules/game/application/game-log.service'
import type { LinkClientService } from '@/modules/game/application/link-client.service'
import type { LinkEventName, LinkUserState } from '@/modules/game/domain/types'

export interface LinkAccountEventPayload {
  accountId: string
  event: LinkEventName
  data: unknown
}

interface AccountLifecycleLinkOpsDeps {
  logger: Logger
  accountRepo: AccountRepository
  gameLog: GameLogService
  registry: AccountRegistryService
  linkClient: LinkClientService
  runnerFactory: AccountRunnerFactory
  stopAccount: (accountId: string) => Promise<boolean>
}

export class AccountLifecycleLinkOps {
  constructor(private readonly deps: AccountLifecycleLinkOpsDeps) {}

  handleLinkAccountEvent(payload: LinkAccountEventPayload) {
    if (payload.event === 'connected') {
      const account = this.deps.accountRepo.getAccountById(payload.accountId)
      if (account?.code != null)
        this.deps.registry.setLastCode(payload.accountId, String(account.code).trim())
    }

    const record = this.deps.registry.get(payload.accountId)
    if (record)
      record.runner.handleLinkEvent(payload.event, payload.data)
  }

  async syncGhostConnections(): Promise<void> {
    if (!this.deps.linkClient.connected)
      return

    try {
      const list = await this.deps.linkClient.listConnections()
      const storeIds = new Set(this.deps.accountRepo.getAllAccounts().map(account => String(account.id)))

      for (const connection of list || []) {
        const accountId = String(connection.accountId ?? '').trim()
        if (!accountId)
          continue
        if (accountId.startsWith('import_') || accountId.startsWith('probe_'))
          continue
        if (!storeIds.has(accountId)) {
          this.deps.logger.log(`清理幽灵连接: ${accountId}`)
          await this.disconnectFromLink(accountId)
        }
      }
    } catch (error: any) {
      this.deps.logger.warn(`同步联机连接列表失败: ${error?.message || error}`)
    }
  }

  async syncAccountsStateFromLink() {
    if (!this.deps.linkClient.connected)
      return

    this.deps.registry.forEach(async (record, accountId) => {
      if (!record.runner.isActive())
        return
      try {
        const meta = await this.deps.linkClient.getAccountStatus(accountId)
        if (meta?.connected && meta.userState)
          record.runner.handleLinkEvent('connected', meta.userState)
        else
          record.runner.handleLinkEvent('disconnected', {})
      } catch {
        record.runner.handleLinkEvent('disconnected', {})
      }
    })
  }

  async disconnectFromLink(accountId: string): Promise<void> {
    await this.deps.linkClient.disconnectAccount(accountId).catch(error => this.deps.logger.warn(`断开联机连接失败 [${accountId}]: ${error?.message || error}`))
    this.deps.registry.deleteLastCode(accountId)
  }

  async rebindLinkConnection(fromId: string, toId: string): Promise<void> {
    const from = String(fromId || '').trim()
    const to = String(toId || '').trim()
    if (!from || !to || from === to)
      return

    await this.deps.linkClient.rebindAccount(from, to)

    const lastCode = this.deps.registry.getLastCode(from)
    if (lastCode !== undefined) {
      this.deps.registry.setLastCode(to, lastCode)
      this.deps.registry.deleteLastCode(from)
    }
  }

  async probeAccountByCode(code: string, platform: string): Promise<{ openId: string, name: string, level: number } | null> {
    const tempId = `probe_${Date.now()}`
    try {
      const userState = await this.deps.linkClient.connectAccount(
        tempId,
        code,
        platform,
        this.deps.runnerFactory.resolveRuntimeClient(null)
      )
      if (!userState?.openId)
        return null
      return {
        openId: String(userState.openId),
        name: String(userState.name || ''),
        level: Number(userState.level) || 0
      }
    } catch (error) {
      this.deps.logger.warn(`按登录码探测账号失败: ${error}`)
      return null
    } finally {
      await this.deps.linkClient.disconnectAccount(tempId).catch(() => {})
    }
  }

  async connectForImport(code: string, platform: string): Promise<{ tempId: string, userState: LinkUserState | undefined }> {
    const tempId = `import_${Date.now()}`
    const userState = await this.deps.linkClient.connectAccount(
      tempId,
      code,
      platform,
      this.deps.runnerFactory.resolveRuntimeClient(null)
    )
    return { tempId, userState }
  }

  async mergeDuplicateAccountsByUinPlatform(accountId: string, openId: string): Promise<void> {
    const id = String(accountId || '').trim()
    const uin = String(openId || '').trim()
    if (!id || !uin)
      return

    const current = this.deps.accountRepo.getAccountById(id)
    if (!current)
      return

    const platform = String(current.platform || 'qq')
    const duplicates = this.deps.accountRepo.getAllAccounts().filter(account =>
      String(account.uin || '').trim() === uin
      && String(account.platform || 'qq') === platform
    )

    if (duplicates.length <= 1)
      return

    for (const duplicate of duplicates) {
      const duplicateId = String(duplicate.id)
      if (duplicateId === id)
        continue

      this.deps.logger.log(`合并重复账号: ${duplicateId} -> ${id} (uin=${uin}, 平台=${platform})`)
      await this.deps.stopAccount(duplicateId).catch(error => this.deps.logger.warn(`停止重复账号失败 [${duplicateId}]: ${error?.message || error}`))
      await this.disconnectFromLink(duplicateId).catch(error => this.deps.logger.warn(`断开重复账号失败 [${duplicateId}]: ${error?.message || error}`))
      this.deps.accountRepo.deleteAccount(duplicateId)
      this.deps.gameLog.deleteAccountLogs(duplicateId)
    }

    await this.syncGhostConnections().catch(error => this.deps.logger.warn(`同步幽灵连接失败: ${error?.message || error}`))
  }
}
