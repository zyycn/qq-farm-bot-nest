export interface AutomationConfig {
  farm: boolean
  farm_manage: boolean
  farm_water: boolean
  farm_weed: boolean
  farm_bug: boolean
  farm_push: boolean
  land_upgrade: boolean
  friend: boolean
  friend_help_exp_limit: boolean
  friend_steal: boolean
  friend_help: boolean
  friend_bad: boolean
  task: boolean
  email: boolean
  fertilizer_gift: boolean
  fertilizer_buy: boolean
  free_gifts: boolean
  share_reward: boolean
  vip_gift: boolean
  month_card: boolean
  open_server_gift: boolean
  sell: boolean
}

export interface IntervalsConfig {
  farm: number
  friend: number
  farmMin: number
  farmMax: number
  friendMin: number
  friendMax: number
}

export interface FriendQuietHoursConfig {
  enabled: boolean
  start: string
  end: string
}

export interface FertilizerBuyConfig {
  type: 'organic' | 'normal' | 'both'
  mode: 'threshold' | 'unlimited'
  max: number
  threshold: number
}

export interface StrategySettings {
  plantingStrategy: string
  preferredSeedId: number
  bagSeedPriority: number[]
  deviceProfileId: string | null
  intervals: IntervalsConfig
  friendQuietHours: FriendQuietHoursConfig
  friendBlacklist: number[]
  stealCropBlacklist: number[]
  automation: AutomationConfig
  fertilizer: string
  fertilizerLandTypes: string[]
  fertilizerMultiSeason: boolean
  fertilizerBuy: FertilizerBuyConfig
}

export type StrategySettingsPatch = Partial<StrategySettings>
