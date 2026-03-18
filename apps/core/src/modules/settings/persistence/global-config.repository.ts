import type { DrizzleDB } from '@/infrastructure/database/drizzle.provider'
import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DRIZZLE_TOKEN } from '@/infrastructure/database/drizzle.provider'
import * as schema from '@/infrastructure/database/schema'

@Injectable()
export class GlobalConfigRepository {
  constructor(@Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDB) {}

  getValue<T>(key: string): T | null {
    const row = this.db.select().from(schema.globalConfigs).where(eq(schema.globalConfigs.key, key)).get()
    return row?.value !== undefined && row?.value !== null ? (row.value as T) : null
  }

  setValue(key: string, value: unknown): void {
    const now = Date.now()
    const existing = this.db.select().from(schema.globalConfigs).where(eq(schema.globalConfigs.key, key)).get()
    if (existing) {
      this.db.update(schema.globalConfigs).set({ value, updatedAt: now }).where(eq(schema.globalConfigs.key, key)).run()
      return
    }

    this.db.insert(schema.globalConfigs).values({ key, value, createdAt: now, updatedAt: now }).run()
  }
}
