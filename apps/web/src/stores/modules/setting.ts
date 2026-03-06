import { defineStore } from 'pinia'
import { ref } from 'vue'
import { settingsApi } from '@/api'
import { DEFAULT_FRIEND_QUIET_HOURS, DEFAULT_OFFLINE_REMINDER } from '../constants'

export interface AutomationConfig {
  farm?: boolean
  farm_push?: boolean
  land_upgrade?: boolean
  friend?: boolean
  friend_help_exp_limit?: boolean
  friend_steal?: boolean
  friend_help?: boolean
  friend_bad?: boolean
  task?: boolean
  email?: boolean
  fertilizer_gift?: boolean
  fertilizer_buy?: boolean
  free_gifts?: boolean
  share_reward?: boolean
  vip_gift?: boolean
  month_card?: boolean
  open_server_gift?: boolean
  sell?: boolean
  fertilizer?: string
}

export interface IntervalsConfig {
  farm?: number
  friend?: number
  farmMin?: number
  farmMax?: number
  friendMin?: number
  friendMax?: number
}

export interface FriendQuietHoursConfig {
  enabled?: boolean
  start?: string
  end?: string
}

export interface OfflineReminderConfig {
  channel: string
  reloginUrlMode: string
  endpoint: string
  token: string
  title: string
  msg: string
  offlineDeleteSec: number
}

/** @deprecated 使用 OfflineReminderConfig */
export type OfflineConfig = OfflineReminderConfig

export interface UIConfig {
  theme?: string
}

export interface SettingsState {
  plantingStrategy: string
  preferredSeedId: number
  intervals: Partial<IntervalsConfig>
  friendQuietHours: Partial<FriendQuietHoursConfig>
  stealCropBlacklist?: number[]
  automation: Partial<AutomationConfig>
  ui: UIConfig
  offlineReminder: OfflineReminderConfig
}

export const useSettingStore = defineStore('setting', () => {
  const settings = ref<SettingsState>({
    plantingStrategy: 'preferred',
    preferredSeedId: 0,
    intervals: {},
    friendQuietHours: { ...DEFAULT_FRIEND_QUIET_HOURS },
    stealCropBlacklist: [],
    automation: {},
    ui: {},
    offlineReminder: { ...DEFAULT_OFFLINE_REMINDER }
  })

  async function fetchSettings(accountId: string) {
    if (!accountId)
      return
    const d = await settingsApi.fetchSettings()
    if (d) {
      settings.value.plantingStrategy = d.strategy || 'preferred'
      settings.value.preferredSeedId = d.preferredSeed || 0
      settings.value.intervals = d.intervals || {}
      settings.value.friendQuietHours = d.friendQuietHours || { ...DEFAULT_FRIEND_QUIET_HOURS }
      settings.value.stealCropBlacklist = Array.isArray(d.stealCropBlacklist) ? d.stealCropBlacklist : []
      settings.value.automation = d.automation || {}
      settings.value.ui = d.ui || {}
      settings.value.offlineReminder = d.offlineReminder || { ...DEFAULT_OFFLINE_REMINDER }
    }
  }

  async function saveSettings(accountId: string, newSettings: any) {
    if (!accountId)
      return { ok: false, error: '未选择账号' }
    try {
      await settingsApi.saveSettings(newSettings)

      if (newSettings.automation) {
        await settingsApi.saveAutomation(newSettings.automation)
      }

      await fetchSettings(accountId)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message || '保存失败' }
    }
  }

  async function saveOfflineConfig(config: OfflineReminderConfig) {
    try {
      await settingsApi.saveOfflineReminder(config)
      settings.value.offlineReminder = config
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message || '保存失败' }
    }
  }

  async function changeAdminPassword(oldPassword: string, newPassword: string) {
    try {
      await settingsApi.changePassword(oldPassword, newPassword)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message || '修改失败' }
    }
  }

  return { settings, fetchSettings, saveSettings, saveOfflineConfig, changeAdminPassword }
}, {
  persist: {
    pick: ['settings'],
    storage: sessionStorage
  }
})
