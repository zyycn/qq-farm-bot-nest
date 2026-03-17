export const FERTILIZER_OPTIONS = [
  { label: '不施肥', value: 'none' },
  { label: '普通 + 有机', value: 'both' },
  { label: '仅普通化肥', value: 'normal' },
  { label: '仅有机化肥', value: 'organic' }
]

export const FERTILIZER_BUY_TYPE_OPTIONS = [
  { label: '仅有机化肥', value: 'organic' },
  { label: '仅普通化肥', value: 'normal' },
  { label: '两者都买', value: 'both' }
]

export const FERTILIZER_BUY_MODE_OPTIONS = [
  { label: '容器不足时购买', value: 'threshold' },
  { label: '无限购买', value: 'unlimited' }
]

export const FERTILIZER_LAND_TYPE_OPTIONS = [
  { label: '金土地', value: 'gold' },
  { label: '黑土地', value: 'black' },
  { label: '红土地', value: 'red' },
  { label: '普通土地', value: 'normal' }
]

export const PREFERRED_SEED_AUTO_OPTION = { label: '自动选择', value: 0 }

export const PLANTING_STRATEGY_OPTIONS = [
  { label: '优先种植指定种子', value: 'preferred' },
  { label: '优先背包种子', value: 'bag_priority' },
  { label: '最高等级作物', value: 'level' },
  { label: '最大经验/小时', value: 'max_exp' },
  { label: '最大普通肥经验/小时', value: 'max_fert_exp' },
  { label: '最大净利润/小时', value: 'max_profit' },
  { label: '最大普通肥净利润/小时', value: 'max_fert_profit' }
]

export const ANALYTICS_SORT_BY_MAP: Record<string, StrategyAnalyticsSortKey> = {
  max_exp: 'exp',
  max_fert_exp: 'fert',
  max_profit: 'profit',
  max_fert_profit: 'fert_profit'
}
type StrategyAnalyticsSortKey = 'exp' | 'fert' | 'profit' | 'fert_profit'
