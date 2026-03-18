import type { AccountConfigSnapshot, AutomationConfig, FertilizerBuyConfig, FertilizerLandType, FertilizerMode, IntervalsConfig, PlantingStrategy } from '../../game/domain/constants'
import { ALL_FERTILIZER_LAND_TYPES, ALLOWED_AUTOMATION_KEYS, ALLOWED_FERTILIZER_MODES, ALLOWED_PLANTING_STRATEGIES, DEFAULT_ACCOUNT_CONFIG, DEFAULT_AUTOMATION, DEFAULT_FRIEND_QUIET_HOURS, DEFAULT_INTERVALS } from '../../game/domain/constants'
import { normalizeTimeString } from '../../game/domain/utils'

const ALLOWED_LAND_TYPES_SET = new Set(ALL_FERTILIZER_LAND_TYPES)

export function normalizeFertilizerLandTypes(input: unknown): FertilizerLandType[] {
  const arr = Array.isArray(input) ? input : []
  const filtered = arr.filter((v): v is FertilizerLandType => typeof v === 'string' && ALLOWED_LAND_TYPES_SET.has(v as FertilizerLandType))
  return (filtered.length > 0 ? [...new Set(filtered)] : [...ALL_FERTILIZER_LAND_TYPES]) as FertilizerLandType[]
}

export function normalizeBagSeedPriority(input: unknown): number[] {
  if (!Array.isArray(input))
    return []
  const result: number[] = []
  for (const item of input) {
    const v = Number.parseInt(String(item), 10)
    if (!Number.isFinite(v) || v <= 0)
      continue
    if (result.includes(v))
      continue
    result.push(v)
  }
  return result
}

export function normalizeFertilizerBuy(input: unknown): FertilizerBuyConfig {
  const src = (input && typeof input === 'object') ? input as Partial<FertilizerBuyConfig> : {}
  const type: FertilizerBuyConfig['type'] = (['organic', 'normal', 'both'].includes(String(src.type)) ? src.type : undefined) as any || 'organic'
  const mode: FertilizerBuyConfig['mode'] = (['threshold', 'unlimited'].includes(String(src.mode)) ? src.mode : undefined) as any || 'threshold'
  let max = Number.parseInt(String(src.max ?? 10), 10)
  if (!Number.isFinite(max) || max < 1)
    max = 1
  if (max > 10)
    max = 10
  let threshold = Number.parseInt(String(src.threshold ?? 100), 10)
  if (!Number.isFinite(threshold) || threshold < 0)
    threshold = 0
  return { type, mode, max, threshold }
}

export function normalizeIntervals(intervals?: Partial<IntervalsConfig>): IntervalsConfig {
  const src = (intervals && typeof intervals === 'object') ? intervals : {} as Partial<IntervalsConfig>
  const toSec = (v: any, d: number) => Math.max(1, Number.parseInt(String(v), 10) || d)
  const farm = toSec(src.farm, DEFAULT_INTERVALS.farm)
  const friend = toSec(src.friend, DEFAULT_INTERVALS.friend)
  let farmMin = toSec(src.farmMin, farm)
  let farmMax = toSec(src.farmMax, farm)
  if (farmMin > farmMax)
    [farmMin, farmMax] = [farmMax, farmMin]
  let friendMin = toSec(src.friendMin, friend)
  let friendMax = toSec(src.friendMax, friend)
  if (friendMin > friendMax)
    [friendMin, friendMax] = [friendMax, friendMin]
  return { farm, friend, farmMin, farmMax, friendMin, friendMax }
}

export function cloneAccountConfig(base?: Partial<AccountConfigSnapshot>): AccountConfigSnapshot {
  const b = base || DEFAULT_ACCOUNT_CONFIG
  const srcAutomation = (b.automation && typeof b.automation === 'object') ? b.automation : {} as Partial<AutomationConfig>
  const automation = { ...DEFAULT_AUTOMATION }
  for (const key of Object.keys(automation) as (keyof AutomationConfig)[]) {
    if ((srcAutomation as any)[key] !== undefined)
      (automation as any)[key] = (srcAutomation as any)[key]
  }
  const rawBlacklist = Array.isArray(b.friendBlacklist) ? b.friendBlacklist : []
  const rawStealBlacklist = Array.isArray(b.stealCropBlacklist) ? b.stealCropBlacklist : []
  return {
    automation,
    plantingStrategy: ALLOWED_PLANTING_STRATEGIES.includes(String(b.plantingStrategy || '') as PlantingStrategy)
      ? (String(b.plantingStrategy) as PlantingStrategy)
      : DEFAULT_ACCOUNT_CONFIG.plantingStrategy,
    preferredSeedId: Math.max(0, Number.parseInt(String(b.preferredSeedId), 10) || 0),
    bagSeedPriority: normalizeBagSeedPriority((b as any).bagSeedPriority),
    intervals: normalizeIntervals(b.intervals),
    friendQuietHours: { ...(b.friendQuietHours || DEFAULT_FRIEND_QUIET_HOURS) },
    friendBlacklist: rawBlacklist.map(Number).filter(n => Number.isFinite(n) && n > 0),
    stealCropBlacklist: rawStealBlacklist.map(Number).filter(n => Number.isFinite(n) && n >= 0),
    fertilizer: (b as any).fertilizer ?? DEFAULT_ACCOUNT_CONFIG.fertilizer,
    fertilizerLandTypes: normalizeFertilizerLandTypes((b as any).fertilizerLandTypes),
    fertilizerMultiSeason: (b as any).fertilizerMultiSeason !== undefined ? !!(b as any).fertilizerMultiSeason : DEFAULT_ACCOUNT_CONFIG.fertilizerMultiSeason,
    fertilizerBuy: normalizeFertilizerBuy((b as any).fertilizerBuy),
    deviceProfileId: b.deviceProfileId != null ? String(b.deviceProfileId).trim() || null : DEFAULT_ACCOUNT_CONFIG.deviceProfileId
  }
}

export function normalizeAccountConfig(input?: Partial<AccountConfigSnapshot>, fallback?: AccountConfigSnapshot): AccountConfigSnapshot {
  const src = (input && typeof input === 'object') ? input : {} as Partial<AccountConfigSnapshot>
  const cfg = cloneAccountConfig(fallback || DEFAULT_ACCOUNT_CONFIG)

  if (src.automation && typeof src.automation === 'object') {
    for (const [k, v] of Object.entries(src.automation)) {
      if (ALLOWED_AUTOMATION_KEYS.has(k))
        (cfg.automation as any)[k] = !!v
    }
  }

  if (src.fertilizer !== undefined) {
    cfg.fertilizer = ALLOWED_FERTILIZER_MODES.includes(src.fertilizer as FertilizerMode)
      ? (src.fertilizer as FertilizerMode)
      : cfg.fertilizer
  }

  if (src.fertilizerLandTypes !== undefined)
    cfg.fertilizerLandTypes = normalizeFertilizerLandTypes(src.fertilizerLandTypes)

  if (src.fertilizerMultiSeason !== undefined)
    cfg.fertilizerMultiSeason = !!src.fertilizerMultiSeason

  if (src.plantingStrategy && ALLOWED_PLANTING_STRATEGIES.includes(src.plantingStrategy))
    cfg.plantingStrategy = src.plantingStrategy

  if (src.preferredSeedId != null)
    cfg.preferredSeedId = Math.max(0, Number.parseInt(String(src.preferredSeedId), 10) || 0)

  if (src.bagSeedPriority !== undefined)
    (cfg as any).bagSeedPriority = normalizeBagSeedPriority(src.bagSeedPriority as any)

  if (src.intervals && typeof src.intervals === 'object') {
    for (const [type, sec] of Object.entries(src.intervals)) {
      if ((cfg.intervals as any)[type] !== undefined)
        (cfg.intervals as any)[type] = Math.max(1, Number.parseInt(String(sec), 10) || (cfg.intervals as any)[type] || 1)
    }
    cfg.intervals = normalizeIntervals(cfg.intervals)
  }

  if (src.friendQuietHours && typeof src.friendQuietHours === 'object') {
    const old = cfg.friendQuietHours
    cfg.friendQuietHours = {
      enabled: src.friendQuietHours.enabled !== undefined ? !!src.friendQuietHours.enabled : old.enabled,
      start: normalizeTimeString(src.friendQuietHours.start, old.start || '23:00'),
      end: normalizeTimeString(src.friendQuietHours.end, old.end || '07:00')
    }
  }

  if (Array.isArray(src.friendBlacklist))
    cfg.friendBlacklist = src.friendBlacklist.map(Number).filter(n => Number.isFinite(n) && n > 0)

  if (Array.isArray(src.stealCropBlacklist))
    cfg.stealCropBlacklist = src.stealCropBlacklist.map(Number).filter(n => Number.isFinite(n) && n >= 0)

  if (src.fertilizerBuy !== undefined)
    cfg.fertilizerBuy = normalizeFertilizerBuy(src.fertilizerBuy as any)

  return cfg
}
