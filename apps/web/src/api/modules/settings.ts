import { ws } from '../services/ws'

export function save(data: any): Promise<any> {
  return ws.post('/settings', data)
}

export function saveTheme(theme: string): Promise<any> {
  return ws.post('/settings/theme', { theme })
}

export function saveOfflineReminder(data: any): Promise<any> {
  return ws.post('/settings/offline-reminder', data)
}

export function onSettingsUpdate(handler: (data: any) => void): void {
  ws.on('settings:update', handler)
}

export function offSettingsUpdate(handler: (data: any) => void): void {
  ws.off('settings:update', handler)
}
