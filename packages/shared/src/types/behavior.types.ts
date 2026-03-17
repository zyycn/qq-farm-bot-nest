export type BehaviorMode = 'legacy' | 'balanced' | 'full-humanized' | 'custom'

export interface BehaviorDelayConfig {
  rapidBatchMin: number
  rapidBatchMax: number
  actionMin: number
  actionMax: number
  batchMin: number
  batchMax: number
  taskSwitchMin: number
  taskSwitchMax: number
  friendSwitchMin: number
  friendSwitchMax: number
}

export interface BehaviorRhythmConfig {
  enableGradualPace: boolean
  enableRandomPause: boolean
  pauseProbability: number
  pauseMin: number
  pauseMax: number
  enableOrderShuffle: boolean
}

export interface BehaviorSessionConfig {
  enableColdStart: boolean
  coldStartMin: number
  coldStartMax: number
  enableLingerAfterOps: boolean
  lingerMin: number
  lingerMax: number
  enableIdleDisconnect: boolean
  idleDisconnectMin: number
  idleDisconnectMax: number
  enableSessionBootstrap: boolean
}

export interface BehaviorFriendConfig {
  enableRandomSkip: boolean
  skipProbability: number
  enableBatchLimit: boolean
  batchSize: number
  batchRestMin: number
  batchRestMax: number
}

export interface BehaviorMultiAccountConfig {
  enableStartJitter: boolean
  startJitterMin: number
  startJitterMax: number
  enableScheduleOffset: boolean
  scheduleOffsetMin: number
  scheduleOffsetMax: number
}

export interface BehaviorBackgroundRequestsConfig {
  enabled: boolean
  frequency: number
}

export interface BehaviorActiveHoursWindow {
  start: string
  end: string
}

export interface BehaviorActiveHoursConfig {
  enabled: boolean
  windows: BehaviorActiveHoursWindow[]
  quietMode: 'disconnect' | 'heartbeat-only'
}

export interface BehaviorConfig {
  // Quick fallback switch: false forces enhancement features back to legacy mode.
  enabled: boolean
  mode: BehaviorMode
  delay: BehaviorDelayConfig
  rhythm: BehaviorRhythmConfig
  session: BehaviorSessionConfig
  friend: BehaviorFriendConfig
  multiAccount: BehaviorMultiAccountConfig
  backgroundRequests: BehaviorBackgroundRequestsConfig
  activeHours: BehaviorActiveHoursConfig
}

export type BehaviorEnhancementSectionKey =
  | 'delay'
  | 'rhythm'
  | 'session'
  | 'friend'
  | 'multiAccount'
  | 'backgroundRequests'

export type BehaviorEnhancementConfig = Pick<BehaviorConfig, BehaviorEnhancementSectionKey>

export interface EffectiveBehaviorConfig extends BehaviorConfig {
  requestedMode: BehaviorMode
  effectiveMode: BehaviorMode
  quickFallbackActive: boolean
}

const BALANCED_DELAY: BehaviorDelayConfig = {
  rapidBatchMin: 30,
  rapidBatchMax: 150,
  actionMin: 200,
  actionMax: 800,
  batchMin: 500,
  batchMax: 2000,
  taskSwitchMin: 1000,
  taskSwitchMax: 5000,
  friendSwitchMin: 2000,
  friendSwitchMax: 8000
}

const BALANCED_RHYTHM: BehaviorRhythmConfig = {
  enableGradualPace: true,
  enableRandomPause: true,
  pauseProbability: 0.15,
  pauseMin: 1000,
  pauseMax: 3000,
  enableOrderShuffle: true
}

const BALANCED_SESSION: BehaviorSessionConfig = {
  enableColdStart: true,
  coldStartMin: 3000,
  coldStartMax: 8000,
  enableLingerAfterOps: true,
  lingerMin: 10000,
  lingerMax: 60000,
  enableIdleDisconnect: true,
  idleDisconnectMin: 300000,
  idleDisconnectMax: 900000,
  enableSessionBootstrap: true
}

const BALANCED_FRIEND: BehaviorFriendConfig = {
  enableRandomSkip: false,
  skipProbability: 0.1,
  enableBatchLimit: true,
  batchSize: 10,
  batchRestMin: 5000,
  batchRestMax: 15000
}

const BALANCED_MULTI_ACCOUNT: BehaviorMultiAccountConfig = {
  enableStartJitter: true,
  startJitterMin: 5000,
  startJitterMax: 60000,
  enableScheduleOffset: true,
  scheduleOffsetMin: 10000,
  scheduleOffsetMax: 120000
}

const BALANCED_BACKGROUND: BehaviorBackgroundRequestsConfig = {
  enabled: true,
  frequency: 5
}

const DEFAULT_ACTIVE_HOURS: BehaviorActiveHoursConfig = {
  enabled: false,
  windows: [{ start: '07:00', end: '23:59' }],
  quietMode: 'disconnect'
}

const LEGACY_PRESET: BehaviorEnhancementConfig = {
  delay: {
    rapidBatchMin: 50,
    rapidBatchMax: 50,
    actionMin: 200,
    actionMax: 200,
    batchMin: 200,
    batchMax: 200,
    taskSwitchMin: 500,
    taskSwitchMax: 500,
    friendSwitchMin: 200,
    friendSwitchMax: 200
  },
  rhythm: {
    enableGradualPace: false,
    enableRandomPause: false,
    pauseProbability: 0,
    pauseMin: 0,
    pauseMax: 0,
    enableOrderShuffle: false
  },
  session: {
    enableColdStart: false,
    coldStartMin: 0,
    coldStartMax: 0,
    enableLingerAfterOps: false,
    lingerMin: 0,
    lingerMax: 0,
    enableIdleDisconnect: false,
    idleDisconnectMin: 0,
    idleDisconnectMax: 0,
    enableSessionBootstrap: false
  },
  friend: {
    enableRandomSkip: false,
    skipProbability: 0,
    enableBatchLimit: false,
    batchSize: 9999,
    batchRestMin: 0,
    batchRestMax: 0
  },
  multiAccount: {
    enableStartJitter: false,
    startJitterMin: 0,
    startJitterMax: 0,
    enableScheduleOffset: false,
    scheduleOffsetMin: 0,
    scheduleOffsetMax: 0
  },
  backgroundRequests: {
    enabled: false,
    frequency: 0
  }
}

const FULL_HUMANIZED_PRESET: BehaviorEnhancementConfig = {
  delay: {
    rapidBatchMin: 60,
    rapidBatchMax: 220,
    actionMin: 350,
    actionMax: 1400,
    batchMin: 1200,
    batchMax: 3500,
    taskSwitchMin: 2500,
    taskSwitchMax: 9000,
    friendSwitchMin: 3500,
    friendSwitchMax: 12000
  },
  rhythm: {
    enableGradualPace: true,
    enableRandomPause: true,
    pauseProbability: 0.25,
    pauseMin: 1500,
    pauseMax: 5000,
    enableOrderShuffle: true
  },
  session: {
    enableColdStart: true,
    coldStartMin: 5000,
    coldStartMax: 12000,
    enableLingerAfterOps: true,
    lingerMin: 20000,
    lingerMax: 120000,
    enableIdleDisconnect: true,
    idleDisconnectMin: 420000,
    idleDisconnectMax: 1200000,
    enableSessionBootstrap: true
  },
  friend: {
    enableRandomSkip: true,
    skipProbability: 0.08,
    enableBatchLimit: true,
    batchSize: 6,
    batchRestMin: 8000,
    batchRestMax: 25000
  },
  multiAccount: {
    enableStartJitter: true,
    startJitterMin: 10000,
    startJitterMax: 120000,
    enableScheduleOffset: true,
    scheduleOffsetMin: 30000,
    scheduleOffsetMax: 240000
  },
  backgroundRequests: {
    enabled: true,
    frequency: 3
  }
}

export const BEHAVIOR_MODE_PRESETS: Record<Exclude<BehaviorMode, 'custom'>, BehaviorEnhancementConfig> = {
  legacy: LEGACY_PRESET,
  balanced: {
    delay: BALANCED_DELAY,
    rhythm: BALANCED_RHYTHM,
    session: BALANCED_SESSION,
    friend: BALANCED_FRIEND,
    multiAccount: BALANCED_MULTI_ACCOUNT,
    backgroundRequests: BALANCED_BACKGROUND
  },
  'full-humanized': FULL_HUMANIZED_PRESET
}

function deepMerge<T extends Record<string, any>>(base: T, override?: Partial<T> | null): T {
  const result = { ...base }
  if (!override)
    return result

  for (const key of Object.keys(override) as Array<keyof T>) {
    const value = override[key]
    if (value === undefined || value === null)
      continue

    if (Array.isArray(value)) {
      ;(result as any)[key] = [...value]
      continue
    }

    const current = result[key]
    if (typeof value === 'object' && value !== null && typeof current === 'object' && current !== null && !Array.isArray(current)) {
      ;(result as any)[key] = deepMerge(current as Record<string, any>, value as Record<string, any>)
    } else {
      ;(result as any)[key] = value
    }
  }

  return result
}

function normalizeMode(mode: unknown): BehaviorMode {
  return mode === 'legacy' || mode === 'balanced' || mode === 'full-humanized' || mode === 'custom'
    ? mode
    : 'balanced'
}

function pickEnhancements(config: BehaviorConfig): BehaviorEnhancementConfig {
  return {
    delay: config.delay,
    rhythm: config.rhythm,
    session: config.session,
    friend: config.friend,
    multiAccount: config.multiAccount,
    backgroundRequests: config.backgroundRequests
  }
}

export function createDefaultBehaviorConfig(): BehaviorConfig {
  return {
    enabled: true,
    mode: 'balanced',
    delay: { ...BALANCED_DELAY },
    rhythm: { ...BALANCED_RHYTHM },
    session: { ...BALANCED_SESSION },
    friend: { ...BALANCED_FRIEND },
    multiAccount: { ...BALANCED_MULTI_ACCOUNT },
    backgroundRequests: { ...BALANCED_BACKGROUND },
    activeHours: {
      enabled: DEFAULT_ACTIVE_HOURS.enabled,
      windows: DEFAULT_ACTIVE_HOURS.windows.map(window => ({ ...window })),
      quietMode: DEFAULT_ACTIVE_HOURS.quietMode
    }
  }
}

export function mergeBehaviorConfig(base: BehaviorConfig, override?: Partial<BehaviorConfig> | null): BehaviorConfig {
  const merged = deepMerge(base, override)
  merged.mode = normalizeMode(merged.mode)
  return merged
}

export function normalizeBehaviorConfig(override?: Partial<BehaviorConfig> | null): BehaviorConfig {
  return mergeBehaviorConfig(createDefaultBehaviorConfig(), override)
}

export function createBehaviorModePreset(mode: Exclude<BehaviorMode, 'custom'>): BehaviorEnhancementConfig {
  const preset = BEHAVIOR_MODE_PRESETS[mode]
  return {
    delay: { ...preset.delay },
    rhythm: { ...preset.rhythm },
    session: { ...preset.session },
    friend: { ...preset.friend },
    multiAccount: { ...preset.multiAccount },
    backgroundRequests: { ...preset.backgroundRequests }
  }
}

export function resolveEffectiveBehaviorConfig(config?: Partial<BehaviorConfig> | null): EffectiveBehaviorConfig {
  const normalized = normalizeBehaviorConfig(config)
  const requestedMode = normalized.mode
  const effectiveMode: BehaviorMode = normalized.enabled ? requestedMode : 'legacy'
  const effectiveEnhancements = effectiveMode === 'custom'
    ? pickEnhancements(normalized)
    : createBehaviorModePreset(effectiveMode)

  const effective = mergeBehaviorConfig(createDefaultBehaviorConfig(), effectiveEnhancements as Partial<BehaviorConfig>)

  return {
    ...effective,
    enabled: normalized.enabled,
    mode: normalized.mode,
    activeHours: normalized.activeHours,
    requestedMode,
    effectiveMode,
    quickFallbackActive: !normalized.enabled
  }
}
