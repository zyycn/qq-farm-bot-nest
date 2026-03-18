import type * as Panel from './types'
import { socket } from '../../services/socket'

export type * from './types'

export function saveTheme(theme: string): Promise<Panel.UIConfig> {
  return socket.request('panel.updateTheme', { theme })
}

export function saveOfflineReminder(data: Panel.OfflineReminderConfig): Promise<Panel.OfflineReminderConfig> {
  return socket.request('panel.updateOfflineReminder', data)
}

export function saveRemoteLoginKey(key: string): Promise<Pick<Panel.PanelState, 'remoteLoginKey'>> {
  return socket.request('panel.updateRemoteLoginKey', { key })
}

export function query(): Promise<Panel.PanelState> {
  return socket.request('panel.query')
}
