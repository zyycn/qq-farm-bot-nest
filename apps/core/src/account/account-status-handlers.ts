import type { Logger } from '@nestjs/common'
import type { GameLogService } from '../game/game-log.service'
import type { GamePushService } from '../game/game-push.service'
import type { ConnectionEventData, ProfileEventData, StatusEventData } from '../game/types'
import type { AccountRepository } from '../store/account-repository'
import type { GlobalConfigService } from '../store/global-config.service'
import type { AccountLifecycleService } from './account-lifecycle.service'
import type { RunningAccount } from './account-registry.service'
import type { AccountStatusEventPayload } from './account.events'

export type StatusHandler = (record: RunningAccount, accountId: string, data: StatusEventData) => void | Promise<void>

interface AccountStatusHandlerDeps {
  logger: Logger
  accountRepo: AccountRepository
  globalConfig: GlobalConfigService
  gameLog: GameLogService
  gamePush: GamePushService
  lifecycle: AccountLifecycleService
  notifyAccountsUpdate: () => void
}

export function buildAccountStatusEventHandlers(deps: AccountStatusHandlerDeps): Partial<Record<AccountStatusEventPayload['event'], StatusHandler>> {
  return {
    connection: async (record, accountId, data) => {
      const connection = data as ConnectionEventData
      const connected = !!connection.connected
      syncAccountNickname(deps, record, accountId, connection.accountName)

      if (connected) {
        record.disconnectedSince = 0
        record.autoDeleteTriggered = false
        record.wsError = null
        return
      }

      if (!record.runner.isActive())
        return

      const now = Date.now()
      if (!record.disconnectedSince)
        record.disconnectedSince = now

      const offlineMs = now - record.disconnectedSince
      const offlineReminder = deps.globalConfig.getOfflineReminder()
      const autoDeleteMs = (offlineReminder?.offlineDeleteSec || 9_999_999_999) * 1000

      if (record.autoDeleteTriggered || offlineMs < autoDeleteMs)
        return

      record.autoDeleteTriggered = true
      const offlineMinutes = Math.floor(offlineMs / 60000)
      deps.logger.warn(`账号 ${record.name} 持续离线 ${offlineMinutes} 分钟，自动删除`)
      await deps.gamePush.triggerOfflineReminder(accountId, record.name, 'offline_timeout', offlineMs)
      deps.gameLog.addAccountLog('offline_delete', `账号 ${record.name} 持续离线 ${offlineMinutes} 分钟，已自动删除`, accountId, record.name)
      await deps.lifecycle.stopAccount(accountId).catch(error => deps.logger.warn(`自动删除离线账号失败 [${accountId}]: ${error?.message || error}`))
      await deps.lifecycle.disconnectFromLink(accountId).catch(error => deps.logger.warn(`断开离线账号失败 [${accountId}]: ${error?.message || error}`))
      deps.accountRepo.deleteAccount(accountId)
      deps.gameLog.deleteAccountLogs(accountId)
      deps.notifyAccountsUpdate()
    },
    profile: (record, accountId, data) => {
      const profile = data as ProfileEventData
      syncAccountNickname(deps, record, accountId, profile.name)

      if (profile.avatarUrl && profile.avatarUrl.trim() !== '') {
        deps.accountRepo.addOrUpdateAccount({ id: accountId, avatar: profile.avatarUrl })
        deps.notifyAccountsUpdate()
      }

      if (!profile.openId || profile.openId.trim() === '')
        return

      const existing = deps.accountRepo.getAccountById(accountId)
      if (!existing?.uin || String(existing.uin).trim() === '')
        deps.accountRepo.addOrUpdateAccount({ id: accountId, uin: profile.openId })

      deps.lifecycle
        .mergeDuplicateAccountsByUinPlatform(accountId, profile.openId)
        .then(() => deps.notifyAccountsUpdate())
        .catch(error => deps.logger.warn(`合并重复账号失败: ${error?.message || error}`))
    }
  }
}

function syncAccountNickname(deps: AccountStatusHandlerDeps, record: RunningAccount, accountId: string, newName: string) {
  if (!newName || newName === '未知' || newName === '未登录' || record.name === newName)
    return

  const oldName = record.name
  record.name = newName
  record.runner.name = newName
  deps.accountRepo.addOrUpdateAccount({ id: accountId, nick: newName })
  deps.gameLog.appendLog(accountId, newName, {
    msg: `已同步账号昵称: ${oldName || 'None'} -> ${newName}`,
    tag: '系统',
    meta: { module: 'system', event: 'nick_sync' }
  })
}
