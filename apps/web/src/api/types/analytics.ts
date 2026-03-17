export type AnalyticsSortKey = 'exp' | 'fert' | 'profit' | 'fert_profit' | 'level'

export interface AnalyticsCropRow {
  seedId: number
  name: string
  level?: number | null
  image?: string
  seasons?: number
  growTime?: number
  expPerHour?: number
  normalFertilizerExpPerHour?: number | null
  profitPerHour?: number | null
  normalFertilizerProfitPerHour?: number | null
  [key: string]: unknown
}
