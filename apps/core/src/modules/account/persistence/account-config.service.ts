import type { DrizzleDB } from '@/infrastructure/database/drizzle.provider'
import type { AccountConfigSnapshot, AutomationConfig, FriendQuietHoursConfig, IntervalsConfig, PlantingStrategy } from '@/modules/game/domain/constants'
import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DRIZZLE_TOKEN } from '@/infrastructure/database/drizzle.provider'
import * as schema from '@/infrastructure/database/schema'
import { DEFAULT_ACCOUNT_CONFIG } from '@/modules/game/domain/constants'
import { GlobalConfigService } from '@/modules/settings/application/global-config.service'
import { cloneAccountConfig, normalizeAccountConfig } from './account-config-normalizer'

@Injectable()
export class AccountConfigService {
  constructor(
    @Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDB,
    private readonly globalConfig: GlobalConfigService
  ) {}

  // ========== Default Account Config ==========

  getDefaultAccountConfig(): AccountConfigSnapshot {
    const saved = this.globalConfig.getGlobalValue<Partial<AccountConfigSnapshot>>('defaultAccountConfig', {})
    return normalizeAccountConfig(saved, DEFAULT_ACCOUNT_CONFIG)
  }

  private setDefaultAccountConfig(cfg: AccountConfigSnapshot): void {
    this.globalConfig.setGlobalValue('defaultAccountConfig', cfg)
  }

  // ========== Account Config CRUD ==========

  getAccountConfig(accountId: string): AccountConfigSnapshot {
    const fallback = this.getDefaultAccountConfig()
    if (!accountId)
      return cloneAccountConfig(fallback)

    const row = this.db.select().from(schema.accountConfigs).where(eq(schema.accountConfigs.accountId, accountId)).get()
    if (!row)
      return normalizeAccountConfig({}, fallback)

    return normalizeAccountConfig({
      automation: row.automation as any,
      plantingStrategy: row.plantingStrategy as PlantingStrategy,
      preferredSeedId: row.preferredSeedId ?? 0,
      bagSeedPriority: row.bagSeedPriority as any,
      intervals: row.intervals as any,
      friendQuietHours: row.friendQuietHours as any,
      friendBlacklist: row.friendBlacklist as any,
      stealCropBlacklist: row.stealCropBlacklist as any,
      fertilizer: row.fertilizer as any,
      fertilizerLandTypes: row.fertilizerLandTypes as any,
      fertilizerMultiSeason: row.fertilizerMultiSeason,
      fertilizerBuy: row.fertilizerBuy as any,
      deviceProfileId: row.deviceProfileId
    }, fallback)
  }

  setAccountConfig(accountId: string, nextConfig: Partial<AccountConfigSnapshot>): AccountConfigSnapshot {
    if (!accountId) {
      const fallback = this.getDefaultAccountConfig()
      const updated = normalizeAccountConfig(nextConfig, fallback)
      this.setDefaultAccountConfig(updated)
      return cloneAccountConfig(updated)
    }

    const fallback = this.getDefaultAccountConfig()
    const current = this.getAccountConfig(accountId)
    const merged = normalizeAccountConfig({ ...current, ...nextConfig }, fallback)

    const now = Date.now()
    const existing = this.db.select().from(schema.accountConfigs).where(eq(schema.accountConfigs.accountId, accountId)).get()
    const data = {
      automation: merged.automation as any,
      plantingStrategy: merged.plantingStrategy,
      preferredSeedId: merged.preferredSeedId,
      bagSeedPriority: merged.bagSeedPriority as any,
      intervals: merged.intervals as any,
      friendQuietHours: merged.friendQuietHours as any,
      friendBlacklist: merged.friendBlacklist as any,
      stealCropBlacklist: merged.stealCropBlacklist as any,
      fertilizer: merged.fertilizer,
      fertilizerLandTypes: merged.fertilizerLandTypes as any,
      fertilizerMultiSeason: merged.fertilizerMultiSeason,
      fertilizerBuy: merged.fertilizerBuy as any,
      deviceProfileId: merged.deviceProfileId
    }

    if (existing) {
      this.db.update(schema.accountConfigs).set({ ...data, updatedAt: now }).where(eq(schema.accountConfigs.accountId, accountId)).run()
    } else {
      this.db.insert(schema.accountConfigs).values({ accountId, ...data, createdAt: now, updatedAt: now }).run()
    }

    return cloneAccountConfig(merged)
  }

  removeAccountConfig(accountId: string): void {
    if (!accountId)
      return
    this.db.delete(schema.accountConfigs).where(eq(schema.accountConfigs.accountId, accountId)).run()
  }

  ensureAccountConfig(accountId: string): AccountConfigSnapshot | null {
    if (!accountId)
      return null
    const existing = this.db.select().from(schema.accountConfigs).where(eq(schema.accountConfigs.accountId, accountId)).get()
    if (existing)
      return this.getAccountConfig(accountId)

    const fallback = this.getDefaultAccountConfig()
    const cfg = normalizeAccountConfig(fallback, DEFAULT_ACCOUNT_CONFIG)

    const now = Date.now()
    this.db.insert(schema.accountConfigs).values({
      accountId,
      automation: cfg.automation as any,
      plantingStrategy: cfg.plantingStrategy,
      preferredSeedId: cfg.preferredSeedId,
      bagSeedPriority: cfg.bagSeedPriority as any,
      intervals: cfg.intervals as any,
      friendQuietHours: cfg.friendQuietHours as any,
      friendBlacklist: cfg.friendBlacklist as any,
      stealCropBlacklist: cfg.stealCropBlacklist as any,
      fertilizer: cfg.fertilizer,
      fertilizerLandTypes: cfg.fertilizerLandTypes as any,
      fertilizerMultiSeason: cfg.fertilizerMultiSeason,
      fertilizerBuy: cfg.fertilizerBuy as any,
      deviceProfileId: cfg.deviceProfileId,
      createdAt: now,
      updatedAt: now
    }).run()

    return cloneAccountConfig(cfg)
  }

  // ========== Convenience Getters ==========

  getAutomation(accountId: string): AutomationConfig {
    return { ...this.getAccountConfig(accountId).automation }
  }

  setAutomation(key: string, value: any, accountId: string): AccountConfigSnapshot {
    return this.applyConfigSnapshot({ automation: { [key]: value } as any }, accountId)
  }

  isAutomationOn(key: string, accountId: string): boolean {
    return !!(this.getAccountConfig(accountId).automation as any)[key]
  }

  getPreferredSeed(accountId: string): number {
    return this.getAccountConfig(accountId).preferredSeedId
  }

  getBagSeedPriority(accountId: string): number[] {
    return [...(this.getAccountConfig(accountId).bagSeedPriority || [])]
  }

  getPlantingStrategy(accountId: string): PlantingStrategy {
    return this.getAccountConfig(accountId).plantingStrategy
  }

  getIntervals(accountId: string): IntervalsConfig {
    return { ...this.getAccountConfig(accountId).intervals }
  }

  getFriendQuietHours(accountId: string): FriendQuietHoursConfig {
    return { ...this.getAccountConfig(accountId).friendQuietHours }
  }

  getFriendBlacklist(accountId: string): number[] {
    return [...(this.getAccountConfig(accountId).friendBlacklist || [])]
  }

  setFriendBlacklist(accountId: string, list: number[]): number[] {
    const cfg = this.getAccountConfig(accountId)
    cfg.friendBlacklist = Array.isArray(list) ? list.map(Number).filter(n => Number.isFinite(n) && n > 0) : []
    this.setAccountConfig(accountId, cfg)
    return [...cfg.friendBlacklist]
  }

  getStealCropBlacklist(accountId: string): number[] {
    return [...(this.getAccountConfig(accountId).stealCropBlacklist || [])]
  }

  setStealCropBlacklist(accountId: string, list: number[]): number[] {
    const cfg = this.getAccountConfig(accountId)
    cfg.stealCropBlacklist = Array.isArray(list) ? list.map(Number).filter(n => Number.isFinite(n) && n >= 0) : []
    this.setAccountConfig(accountId, cfg)
    return [...cfg.stealCropBlacklist]
  }

  getConfigSnapshot(accountId: string): AccountConfigSnapshot & { ui: { theme: string } } {
    const cfg = this.getAccountConfig(accountId)
    return {
      ...cfg,
      automation: { ...cfg.automation },
      intervals: { ...cfg.intervals },
      friendQuietHours: { ...cfg.friendQuietHours },
      friendBlacklist: [...(cfg.friendBlacklist || [])],
      stealCropBlacklist: [...(cfg.stealCropBlacklist || [])],
      deviceProfileId: cfg.deviceProfileId,
      ui: this.globalConfig.getUI()
    }
  }

  applyConfigSnapshot(snapshot: Partial<AccountConfigSnapshot> & { ui?: { theme?: string } }, accountId: string): AccountConfigSnapshot {
    const cfg = snapshot || {}

    if (cfg.ui && typeof cfg.ui === 'object') {
      const theme = String(cfg.ui.theme || '').trim()
      if (theme)
        this.globalConfig.setUITheme(theme)
    }

    return this.setAccountConfig(accountId, cfg)
  }
}
