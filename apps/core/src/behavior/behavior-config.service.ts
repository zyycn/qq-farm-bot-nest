import type { DrizzleDB } from '../database/drizzle.provider'
import type { BehaviorConfig } from './behavior.types'
import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DRIZZLE_TOKEN } from '../database/drizzle.provider'
import { accountConfigs } from '../database/schema'
import { mergeBehaviorConfig, normalizeBehaviorConfig } from './behavior.types'

@Injectable()
export class BehaviorConfigService {
  private cache = new Map<string, BehaviorConfig>()

  constructor(@Inject(DRIZZLE_TOKEN) private db: DrizzleDB) {}

  getConfig(accountId: string): BehaviorConfig {
    const cached = this.cache.get(accountId)
    if (cached)
      return cached

    const row = this.db.select({ behavior: accountConfigs.behavior })
      .from(accountConfigs)
      .where(eq(accountConfigs.accountId, accountId))
      .get()

    const merged = normalizeBehaviorConfig(
      row?.behavior && typeof row.behavior === 'object'
        ? row.behavior as Partial<BehaviorConfig>
        : undefined
    )
    this.cache.set(accountId, merged)
    return merged
  }

  setConfig(accountId: string, config: Partial<BehaviorConfig>) {
    const current = this.getConfig(accountId)
    const merged = mergeBehaviorConfig(current, config)
    this.db.update(accountConfigs)
      .set({ behavior: merged as any, updatedAt: Date.now() })
      .where(eq(accountConfigs.accountId, accountId))
      .run()
    this.cache.set(accountId, merged)
    return merged
  }

  invalidateCache(accountId?: string) {
    if (accountId)
      this.cache.delete(accountId)
    else
      this.cache.clear()
  }
}
