import type { OfflineReminderConfig } from '@/modules/game/domain/constants'
import { DEFAULT_OFFLINE_REMINDER, PUSHOO_CHANNELS } from '@/modules/game/domain/constants'

export function normalizeOfflineReminderConfig(input?: Partial<OfflineReminderConfig>): OfflineReminderConfig {
  const src = (input && typeof input === 'object') ? input : {}
  let offlineDeleteSec = Number.parseInt(String(src.offlineDeleteSec), 10)
  if (!Number.isFinite(offlineDeleteSec) || offlineDeleteSec < 1)
    offlineDeleteSec = DEFAULT_OFFLINE_REMINDER.offlineDeleteSec

  const rawChannel = src.channel != null ? String(src.channel).trim().toLowerCase() : ''
  const endpoint = src.endpoint != null ? String(src.endpoint).trim() : DEFAULT_OFFLINE_REMINDER.endpoint
  const migratedChannel = rawChannel
    || (PUSHOO_CHANNELS.has(String(endpoint || '').trim().toLowerCase())
      ? String(endpoint || '').trim().toLowerCase()
      : DEFAULT_OFFLINE_REMINDER.channel)
  const channel = PUSHOO_CHANNELS.has(migratedChannel) ? migratedChannel : DEFAULT_OFFLINE_REMINDER.channel

  const rawMode = src.reloginUrlMode != null ? String(src.reloginUrlMode).trim().toLowerCase() : DEFAULT_OFFLINE_REMINDER.reloginUrlMode
  const reloginUrlMode = new Set(['none', 'qq_link', 'qr_link']).has(rawMode) ? rawMode : DEFAULT_OFFLINE_REMINDER.reloginUrlMode

  return {
    channel,
    reloginUrlMode,
    endpoint,
    token: src.token != null ? String(src.token).trim() : DEFAULT_OFFLINE_REMINDER.token,
    title: src.title != null ? String(src.title).trim() : DEFAULT_OFFLINE_REMINDER.title,
    msg: src.msg != null ? String(src.msg).trim() : DEFAULT_OFFLINE_REMINDER.msg,
    offlineDeleteSec
  }
}
