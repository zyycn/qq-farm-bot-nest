import type { AccountLogEntry, GameLogEntry, PersistedLogEntry } from '@/modules/game/domain/types'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { GameLogRepository } from '@/modules/game/persistence/game-log.repository'

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const LOG_DEDUPE_WINDOW_MS = 3000

@Injectable()
export class GameLogService {
  private readonly logger = new Logger(GameLogService.name)
  private globalLogs: PersistedLogEntry[] = []
  private perAccountLogs = new Map<string, PersistedLogEntry[]>()
  private accountLogs: AccountLogEntry[] = []
  private lastAcceptedLogByAccount = new Map<string, { signature: string, createdAt: number }>()

  private onLogCallback: ((entry: PersistedLogEntry) => void) | null = null
  private onAccountLogCallback: ((entry: AccountLogEntry) => void) | null = null

  constructor(private readonly gameLogRepository: GameLogRepository) {}

  setCallbacks(callbacks: { onLog?: (entry: PersistedLogEntry) => void, onAccountLog?: (entry: AccountLogEntry) => void }) {
    if (callbacks.onLog)
      this.onLogCallback = callbacks.onLog
    if (callbacks.onAccountLog)
      this.onAccountLogCallback = callbacks.onAccountLog
  }

  /** 写入一条农场/运行日志（内存 + 持久化 + 实时回调） */
  appendLog(accountId: string, accountName: string, entry: GameLogEntry) {
    const normalizedEntry = this.normalizeGameLogEntry(entry)
    const logEntry: PersistedLogEntry = {
      ...normalizedEntry,
      accountId,
      accountName,
      createdAt: Date.now(),
      _searchText: `${normalizedEntry?.msg || ''} ${normalizedEntry?.tag || ''} ${JSON.stringify(normalizedEntry?.meta || {})}`.toLowerCase()
    }

    if (this.shouldSuppressDuplicateLog(logEntry))
      return

    let list = this.perAccountLogs.get(accountId)
    if (!list) {
      list = []
      this.perAccountLogs.set(accountId, list)
    }
    list.push(logEntry)
    if (list.length > 1000)
      list.shift()

    this.globalLogs.push(logEntry)
    if (this.globalLogs.length > 1000)
      this.globalLogs.shift()

    this.persistLog(logEntry)
    this.onLogCallback?.(logEntry)
  }

  getLogs(
    accountId: string,
    options?: { keyword?: string, limit?: number, module?: string, event?: string, isWarn?: boolean }
  ) {
    const limit = options?.limit || 100
    const keyword = (options?.keyword || '').toLowerCase().trim()
    const moduleFilter = options?.module?.trim()
    const eventFilter = options?.event?.trim()
    const isWarnFilter = options?.isWarn

    let result = accountId ? (this.perAccountLogs.get(accountId) || []) : this.globalLogs

    if (keyword)
      result = result.filter(l => l._searchText?.includes(keyword))
    if (moduleFilter)
      result = result.filter(l => l.meta?.module === moduleFilter)
    if (eventFilter)
      result = result.filter(l => l.meta?.event === eventFilter)
    if (typeof isWarnFilter === 'boolean')
      result = result.filter(l => Boolean(l.isWarn) === isWarnFilter)

    return result.slice(-limit)
  }

  addAccountLog(action: string, msg: string, accountId: string, accountName: string, extra?: Record<string, unknown>) {
    const now = Date.now()
    const reason = String(extra?.reason || '')
    const entry: AccountLogEntry = { action, msg, accountId, accountName, createdAt: now, reason }
    this.accountLogs.push(entry)
    if (this.accountLogs.length > 500)
      this.accountLogs.shift()
    this.gameLogRepository
      .insertAccountLog(entry, extra)
      .catch(e => this.logger.warn(`持久化账号操作日志失败: ${(e as Error)?.message}`))
    this.onAccountLogCallback?.(entry)
  }

  getAccountLogs(limit = 50) {
    return this.accountLogs.slice(-limit)
  }

  /** 删除指定账号的日志（数据库 + 内存），删除账号时调用 */
  deleteAccountLogs(accountId: string) {
    if (!accountId)
      return
    try {
      this.gameLogRepository.deleteLogsByAccount(accountId)
    } catch (e: any) {
      this.logger.warn(`删除账号日志失败: ${e?.message}`)
    }
    this.perAccountLogs.delete(accountId)
    this.lastAcceptedLogByAccount.delete(accountId)
    this.globalLogs = this.globalLogs.filter(l => l.accountId !== accountId)
    this.accountLogs = this.accountLogs.filter(l => l.accountId !== accountId)
  }

  private shouldSuppressDuplicateLog(entry: PersistedLogEntry): boolean {
    const signature = [
      entry.tag || '',
      entry.meta?.module || '',
      entry.meta?.event || '',
      entry.isWarn ? 'warn' : 'info',
      entry.msg || ''
    ].join('|')

    const last = this.lastAcceptedLogByAccount.get(entry.accountId)
    this.lastAcceptedLogByAccount.set(entry.accountId, {
      signature,
      createdAt: entry.createdAt
    })

    return !!last
      && last.signature === signature
      && entry.createdAt - last.createdAt <= LOG_DEDUPE_WINDOW_MS
  }

  private normalizeGameLogEntry(entry: GameLogEntry): GameLogEntry {
    const rawMsg = String(entry.msg || '')
    const msg = rawMsg
      .replace(/^执行失败 \[[^\]]+\]:\s*/, '')
      .replace(/Request queue wait timeout:\s*(?:\S.*|[\t\v\f \xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF])$/i, '请求排队超时')

    return {
      ...entry,
      msg
    }
  }

  private async persistLog(entry: PersistedLogEntry) {
    try {
      await this.gameLogRepository.insertGameLog(entry)
    } catch (e) {
      this.logger.warn(`持久化游戏日志失败: ${(e as Error)?.message}`)
    }
  }

  /** 每日凌晨 4 点清理 30 天前的农场日志与账号操作日志 */
  @Cron('0 0 4 * * *')
  cleanupOldLogs() {
    try {
      const { logsDeleted, accountLogsDeleted } = this.gameLogRepository.cleanupLogs(RETENTION_MS)
      if (logsDeleted > 0 || accountLogsDeleted > 0) {
        this.logger.log(`日志清理完成: 农场日志删除 ${logsDeleted} 条，账号操作日志删除 ${accountLogsDeleted} 条`)
      }
    } catch (e: any) {
      this.logger.warn(`日志清理失败: ${e?.message}`)
    }
  }
}
