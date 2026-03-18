import type { DrizzleDB } from '../database/drizzle.provider'
import type { OfflineReminderConfig } from '../game/constants'
import { Inject, Injectable } from '@nestjs/common'
import { DEFAULT_REMOTE_LOGIN_KEY } from '@qq-farm/shared'
import { eq } from 'drizzle-orm'
import { DRIZZLE_TOKEN } from '../database/drizzle.provider'
import * as schema from '../database/schema'
import { normalizeOfflineReminderConfig } from './config-normalizer'

@Injectable()
export class GlobalConfigService {
  constructor(@Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDB) {}

  // ========== Generic Helpers ==========

  getGlobalValue<T>(key: string, fallback: T): T {
    const row = this.db.select().from(schema.globalConfigs).where(eq(schema.globalConfigs.key, key)).get()
    return row?.value !== undefined && row?.value !== null ? (row.value as T) : fallback
  }

  setGlobalValue(key: string, value: any): void {
    const now = Date.now()
    const existing = this.db.select().from(schema.globalConfigs).where(eq(schema.globalConfigs.key, key)).get()
    if (existing) {
      this.db.update(schema.globalConfigs).set({ value, updatedAt: now }).where(eq(schema.globalConfigs.key, key)).run()
    } else {
      this.db.insert(schema.globalConfigs).values({ key, value, createdAt: now, updatedAt: now }).run()
    }
  }

  // ========== Admin Password ==========

  getAdminPasswordHash(): string {
    return String(this.getGlobalValue('adminPasswordHash', '') || '')
  }

  setAdminPasswordHash(hash: string): string {
    const h = String(hash || '')
    this.setGlobalValue('adminPasswordHash', h)
    return h
  }

  // ========== UI ==========

  getUI(): { theme: string } {
    const saved = this.getGlobalValue<{ theme?: string }>('ui', { theme: 'dark' })
    const theme = String(saved?.theme || 'dark').trim()
    return { theme: theme || 'dark' }
  }

  setUITheme(theme: string): { theme: string } {
    const next = String(theme || 'dark').trim().slice(0, 64)
    this.setGlobalValue('ui', { theme: next })
    return { theme: next }
  }

  // ========== Remote Login Key ==========

  getRemoteLoginKey(): string {
    const saved = String(this.getGlobalValue('remoteLoginKey', '') || '').trim()
    if (saved)
      return saved
    this.setGlobalValue('remoteLoginKey', DEFAULT_REMOTE_LOGIN_KEY)
    return DEFAULT_REMOTE_LOGIN_KEY
  }

  setRemoteLoginKey(key: string): string {
    const next = String(key || '').trim()
    this.setGlobalValue('remoteLoginKey', next)
    return next
  }

  // ========== Offline Reminder ==========

  getOfflineReminder(): OfflineReminderConfig {
    const saved = this.getGlobalValue<Partial<OfflineReminderConfig>>('offlineReminder', {})
    return normalizeOfflineReminderConfig(saved)
  }

  setOfflineReminder(cfg: Partial<OfflineReminderConfig>): OfflineReminderConfig {
    const current = this.getOfflineReminder()
    const next = normalizeOfflineReminderConfig({ ...current, ...cfg })
    this.setGlobalValue('offlineReminder', next)
    return next
  }

  // ========== Default Device Profile ==========

  getDefaultDeviceProfileId(): string | null {
    const value = String(this.getGlobalValue<string | null>('defaultDeviceProfileId', '') || '').trim()
    return value || null
  }

  setDefaultDeviceProfileId(deviceProfileId: string | null | undefined): string | null {
    const value = String(deviceProfileId ?? '').trim()
    const normalized = value || null
    this.setGlobalValue('defaultDeviceProfileId', normalized)
    return normalized
  }
}
