import type { PanelState, PanelStatePatch } from '@/api/modules/panel'
import { defineStore } from 'pinia'
import { authApi, panelApi } from '@/api'
import { DEFAULT_OFFLINE_REMINDER } from '../constants'

function initialPanel(): PanelState {
  return {
    ui: {},
    offlineReminder: { ...DEFAULT_OFFLINE_REMINDER },
    remoteLoginKey: ''
  }
}

export const usePanelStore = defineStore('panel', {
  state: () => ({
    settings: initialPanel()
  }),
  actions: {
    applyPanelUpdate(data: PanelStatePatch | null | undefined) {
      if (data != null) {
        if (data.ui !== undefined)
          this.settings.ui = { ...this.settings.ui, ...data.ui }
        if (data.offlineReminder !== undefined)
          this.settings.offlineReminder = { ...this.settings.offlineReminder, ...data.offlineReminder }
        if (data.remoteLoginKey !== undefined)
          this.settings.remoteLoginKey = String(data.remoteLoginKey || '')
      }
    },
    async querySettings(): Promise<{ ok: boolean, error?: string }> {
      try {
        const data = await panelApi.query()
        this.applyPanelUpdate(data)
        return { ok: true }
      } catch (e: unknown) {
        const error = e as { message?: string }
        return { ok: false, error: error?.message || '加载失败' }
      }
    },
    async saveOfflineConfig(): Promise<{ ok: boolean, error?: string }> {
      try {
        await panelApi.saveOfflineReminder(this.settings.offlineReminder)
        return { ok: true }
      } catch (e: unknown) {
        const error = e as { message?: string }
        return { ok: false, error: error.message || '保存失败' }
      }
    },
    async saveRemoteLoginKey(): Promise<{ ok: boolean, error?: string }> {
      try {
        await panelApi.saveRemoteLoginKey(this.settings.remoteLoginKey)
        return { ok: true }
      } catch (e: unknown) {
        const error = e as { message?: string }
        return { ok: false, error: error.message || '保存失败' }
      }
    },
    async changeAdminPassword(oldPassword: string, newPassword: string): Promise<{ ok: boolean, error?: string }> {
      try {
        await authApi.changePassword(oldPassword, newPassword)
        return { ok: true }
      } catch (e: unknown) {
        const error = e as { message?: string }
        return { ok: false, error: error.message || '修改失败' }
      }
    }
  },
  persist: {
    storage: localStorage
  }
})
