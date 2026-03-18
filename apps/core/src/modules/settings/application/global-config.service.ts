import type { OfflineReminderConfig } from '@/modules/game/domain/constants'
import { Injectable } from '@nestjs/common'
import { DEFAULT_REMOTE_LOGIN_KEY } from '@qq-farm/shared'
import { normalizeOfflineReminderConfig } from '@/modules/settings/domain/offline-reminder-normalizer'
import { GlobalConfigRepository } from '@/modules/settings/persistence/global-config.repository'

@Injectable()
export class GlobalConfigService {
  constructor(private readonly repository: GlobalConfigRepository) {}

  // ========== Generic Helpers ==========

  getGlobalValue<T>(key: string, fallback: T): T {
    return this.repository.getValue<T>(key) ?? fallback
  }

  setGlobalValue(key: string, value: any): void {
    this.repository.setValue(key, value)
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
