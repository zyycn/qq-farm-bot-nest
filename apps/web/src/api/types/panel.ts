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

export interface PanelState {
  ui: UIConfig
  offlineReminder: OfflineReminderConfig
  remoteLoginKey: string
}

export interface PanelStatePatch {
  ui?: Partial<UIConfig>
  offlineReminder?: Partial<OfflineReminderConfig>
  remoteLoginKey?: string
}
