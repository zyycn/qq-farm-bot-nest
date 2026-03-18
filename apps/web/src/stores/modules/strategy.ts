import type {
  AutomationConfig,
  FertilizerBuyConfig,
  FriendQuietHoursConfig,
  IntervalsConfig,
  StrategySettings,
  StrategySettingsPatch
} from '@/api/modules/strategy'
import { defineStore } from 'pinia'
import { strategyApi } from '@/api'
import { AUTOMATION_DEFAULTS, DEFAULT_FRIEND_QUIET_HOURS, DEFAULT_INTERVALS } from '../constants'

export type { AutomationConfig, FertilizerBuyConfig, FriendQuietHoursConfig, IntervalsConfig }
export type StrategyState = StrategySettings

const STRATEGY_UPDATE_KEYS = ['intervals', 'plantingStrategy', 'preferredSeedId', 'bagSeedPriority', 'deviceProfileId', 'friendQuietHours', 'friendBlacklist', 'stealCropBlacklist', 'automation', 'fertilizer', 'fertilizerLandTypes', 'fertilizerMultiSeason', 'fertilizerBuy'] as const
const GLOBAL_DEVICE_VALUE = '__global_default_device__'

function normalizeDeviceProfileId(value: unknown): string | null {
  const normalized = String(value || '').trim()
  return normalized && normalized !== GLOBAL_DEVICE_VALUE ? normalized : null
}

function initialStrategy(): StrategyState {
  return {
    plantingStrategy: 'preferred',
    preferredSeedId: 0,
    bagSeedPriority: [],
    deviceProfileId: null,
    intervals: { ...DEFAULT_INTERVALS },
    friendQuietHours: { ...DEFAULT_FRIEND_QUIET_HOURS },
    friendBlacklist: [],
    stealCropBlacklist: [],
    automation: { ...AUTOMATION_DEFAULTS },
    fertilizer: 'none',
    fertilizerLandTypes: [],
    fertilizerMultiSeason: false,
    fertilizerBuy: {
      type: 'organic',
      mode: 'threshold',
      max: 10,
      threshold: 100
    }
  }
}

export const useStrategyStore = defineStore('strategy', {
  state: () => ({
    settings: initialStrategy()
  }),
  actions: {
    applyStrategyUpdate(data: StrategySettingsPatch): void {
      const payload = data as Record<string, unknown>
      for (const k of STRATEGY_UPDATE_KEYS) {
        if (payload[k] !== undefined)
          (this.settings as Record<string, unknown>)[k] = payload[k]
      }
      this.settings.deviceProfileId = normalizeDeviceProfileId(this.settings.deviceProfileId)
    },
    async querySettings(): Promise<{ ok: boolean, error?: string }> {
      try {
        const data = await strategyApi.query()
        this.applyStrategyUpdate(data)
        return { ok: true }
      } catch (e: unknown) {
        const error = e as { message?: string }
        return { ok: false, error: error?.message || '加载失败' }
      }
    },
    async saveSettings(accountId: string): Promise<{ ok: boolean, error?: string }> {
      if (!accountId)
        return { ok: false, error: '未选择账号' }
      const s = this.settings
      try {
        await strategyApi.save({
          plantingStrategy: s.plantingStrategy,
          preferredSeedId: s.preferredSeedId,
          bagSeedPriority: s.bagSeedPriority,
          deviceProfileId: normalizeDeviceProfileId(s.deviceProfileId),
          intervals: s.intervals,
          friendQuietHours: s.friendQuietHours,
          friendBlacklist: s.friendBlacklist,
          stealCropBlacklist: s.stealCropBlacklist,
          automation: s.automation,
          fertilizer: s.fertilizer,
          fertilizerLandTypes: s.fertilizerLandTypes,
          fertilizerMultiSeason: s.fertilizerMultiSeason,
          fertilizerBuy: s.fertilizerBuy
        })
        return { ok: true }
      } catch (e: unknown) {
        const error = e as { message?: string }
        return { ok: false, error: error.message || '保存失败' }
      }
    }
  },
  persist: {
    storage: localStorage
  }
})
