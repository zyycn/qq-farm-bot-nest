import { defineStore } from 'pinia'
import { ref } from 'vue'
import { authApi, ws } from '@/api'
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

  async function saveSettings(accountId: string, newSettings: any) {
    if (!accountId)
      return { ok: false, error: '未选择账号' }
    try {
      const payload = {
        plantingStrategy: newSettings.plantingStrategy,
        preferredSeedId: newSettings.preferredSeedId,
        intervals: newSettings.intervals,
        friendQuietHours: newSettings.friendQuietHours,
        stealCropBlacklist: newSettings.stealCropBlacklist
      }
      await ws.request('settings:save', payload)
      if (newSettings.automation)
        await ws.request('settings:automation', newSettings.automation)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message || '保存失败' }
    }
  }

  async function saveOfflineConfig(config: OfflineReminderConfig) {
    try {
      await ws.request('settings:offline-reminder', config)
      settings.value.offlineReminder = config
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message || '保存失败' }
    }
  }

  async function changeAdminPassword(oldPassword: string, newPassword: string) {
    try {
      await authApi.changePassword(oldPassword, newPassword)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message || '修改失败' }
    }
  }

  function setSettingsFromRealtime(d: Record<string, any>) {
    if (!d || typeof d !== 'object')
      return
    if (d.strategy != null || d.plantingStrategy != null)
      settings.value.plantingStrategy = String(d.strategy ?? d.plantingStrategy ?? settings.value.plantingStrategy)
    if (d.preferredSeed != null || d.preferredSeedId != null)
      settings.value.preferredSeedId = Number(d.preferredSeed ?? d.preferredSeedId ?? 0)
    if (d.intervals != null)
      settings.value.intervals = { ...settings.value.intervals, ...d.intervals }
    if (d.friendQuietHours != null)
      settings.value.friendQuietHours = { ...settings.value.friendQuietHours, ...d.friendQuietHours }
    if (d.stealCropBlacklist != null)
      settings.value.stealCropBlacklist = d.stealCropBlacklist
    if (d.automation != null)
      settings.value.automation = { ...settings.value.automation, ...d.automation }
    if (d.ui != null)
      settings.value.ui = { ...settings.value.ui, ...d.ui }
    if (d.offlineReminder != null)
      settings.value.offlineReminder = { ...settings.value.offlineReminder, ...d.offlineReminder }
  }

  return { settings, saveSettings, saveOfflineConfig, changeAdminPassword, setSettingsFromRealtime }
}, {
  persist: {
    pick: ['settings'],
    storage: sessionStorage
  }
})
