import type { OfflineReminderConfig, PanelState } from '../types'
import { socket } from '../services/socket'

export function saveTheme(theme: string): Promise<unknown> {
  return socket.request('panel.updateTheme', { theme })
}

export function saveOfflineReminder(data: OfflineReminderConfig): Promise<unknown> {
  return socket.request('panel.updateOfflineReminder', data)
}

export function saveRemoteLoginKey(key: string): Promise<unknown> {
  return socket.request('panel.updateRemoteLoginKey', { key })
}

export function query(): Promise<PanelState> {
  return socket.request('panel.query')
}
