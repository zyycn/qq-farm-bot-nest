import type { DrizzleDB } from '@/infrastructure/database/drizzle.provider'
import type { AccountLogEntry, PersistedLogEntry } from '@/modules/game/domain/types'
import { Inject, Injectable } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'
import { DRIZZLE_TOKEN } from '@/infrastructure/database/drizzle.provider'
import * as schema from '@/infrastructure/database/schema'

@Injectable()
export class GameLogRepository {
  constructor(@Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDB) {}

  insertGameLog(entry: PersistedLogEntry): Promise<unknown> {
    return this.db.insert(schema.gameLogs).values({
      accountId: entry.accountId || '',
      accountName: entry.accountName || '',
      tag: entry.tag || '',
      module: entry.meta?.module || '',
      event: entry.meta?.event || '',
      msg: entry.msg || '',
      isWarn: !!entry.isWarn,
      createdAt: entry.createdAt || Date.now(),
      meta: entry.meta || {}
    })
  }

  insertAccountLog(entry: AccountLogEntry, extra?: Record<string, unknown>): Promise<unknown> {
    return this.db.insert(schema.accountLogs).values({
      accountId: entry.accountId,
      accountName: entry.accountName,
      action: entry.action,
      msg: entry.msg,
      reason: entry.reason,
      createdAt: entry.createdAt,
      updatedAt: entry.createdAt,
      extra: extra as Record<string, any> ?? {}
    })
  }

  deleteLogsByAccount(accountId: string): void {
    this.db.delete(schema.gameLogs).where(eq(schema.gameLogs.accountId, accountId)).run()
    this.db.delete(schema.accountLogs).where(eq(schema.accountLogs.accountId, accountId)).run()
  }

  cleanupLogs(retentionMs: number): { accountLogsDeleted: number, logsDeleted: number } {
    const logsResult = this.db.run(sql`
      DELETE FROM game_logs WHERE id IN (
        SELECT l.id FROM game_logs l
        INNER JOIN (SELECT account_id, MAX(created_at) AS last_created_at FROM game_logs GROUP BY account_id) g
        ON l.account_id = g.account_id
        WHERE l.created_at < g.last_created_at - ${retentionMs}
      )
    `) as { changes?: number }

    const accountLogsResult = this.db.run(sql`
      DELETE FROM account_logs WHERE id IN (
        SELECT l.id FROM account_logs l
        INNER JOIN (SELECT account_id, MAX(created_at) AS last_created_at FROM account_logs GROUP BY account_id) g
        ON l.account_id = g.account_id
        WHERE l.created_at < g.last_created_at - ${retentionMs}
      )
    `) as { changes?: number }

    return {
      logsDeleted: logsResult?.changes ?? 0,
      accountLogsDeleted: accountLogsResult?.changes ?? 0
    }
  }
}
