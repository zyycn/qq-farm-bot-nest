export const BAG_ERROR_COOLDOWN_MS = 15_000
export const BAG_HIDDEN_ITEM_IDS = new Set([1, 1001, 1002, 1101, 1011, 1012, 3001, 3002])
export const BAG_DASHBOARD_ITEM_IDS = new Set([1011, 1012, 3001, 3002])

export const LOGS_MAX_LENGTH = 1000

export const DEFAULT_FRIEND_QUIET_HOURS = {
  enabled: false,
  start: '23:00',
  end: '07:00'
}

export const DEFAULT_OFFLINE_REMINDER = {
  channel: 'webhook',
  reloginUrlMode: 'none',
  endpoint: '',
  token: '',
  title: '账号下线提醒',
  msg: '账号下线',
  offlineDeleteSec: 120
}

export const DEFAULT_INTERVALS = {
  farm: 2,
  friend: 10,
  farmMin: 2,
  farmMax: 2,
  friendMin: 10,
  friendMax: 10
}

export const AUTOMATION_DEFAULTS = {
  farm: false,
  task: false,
  sell: false,
  friend: false,
  farm_push: false,
  land_upgrade: false,
  friend_steal: false,
  friend_help: false,
  friend_bad: false,
  friend_help_exp_limit: false,
  email: false,
  fertilizer_gift: false,
  fertilizer_buy: false,
  free_gifts: false,
  share_reward: false,
  vip_gift: false,
  month_card: false,
  open_server_gift: false,
  fertilizer: 'none' as const
}
