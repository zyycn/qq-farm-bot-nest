import { socket } from '../services/socket'

export type AlmanacCategory = 'normal' | 'treasure' | 'unknown'

export interface AlmanacRewardItem {
  itemId: number
  name: string
  count: number
  image: string
}

export interface AlmanacSummary {
  level: number
  exp: number
  nextLevelExp: number
  progressPercent: number
  rewardFlag: number
  rewardBoxVisible: boolean
  rewardBoxEnabled: boolean
  rewardBoxRedDot: boolean
  rewardBoxClaimable: boolean
  rewardBoxClaimableRaw: boolean
  rewardBoxPreview: AlmanacRewardItem | null
  litCount: number
  newCount: number
  totalCount: number
  categoryCounts: Record<AlmanacCategory, number>
}

export interface AlmanacItem {
  fruitId: number
  plantId: number
  seedId: number
  name: string
  image: string
  quality: number
  qualityLabel: string
  rarity: number
  rarityLabel: string
  category: AlmanacCategory
  categoryLabel: string
  litReward: number
  isNew: boolean
  lit: boolean
  statusLabel: string
  reward: AlmanacRewardItem | null
  sourceLabels: string[]
  growTimeSec: number
  growTimeText: string
  seasons: number
  exp: number
  fruitPrice: number
  fruitPriceLabel: string
  seasonalYield: number
  seasonalYieldLabel: string
  seasonalIncome: number
  seasonalIncomeLabel: string
  rewardDescription: string
  detailDescription: string
}

export interface AlmanacOverview {
  summary: AlmanacSummary
  items: AlmanacItem[]
}

export interface AlmanacClaimResult {
  items: AlmanacRewardItem[]
  bonusItems: AlmanacRewardItem[]
  summaryText: string
}

export function query(refresh = false): Promise<AlmanacOverview> {
  return socket.request('almanac.query', { refresh })
}

export function claimRewards(): Promise<AlmanacClaimResult> {
  return socket.request('almanac.claimRewards')
}
