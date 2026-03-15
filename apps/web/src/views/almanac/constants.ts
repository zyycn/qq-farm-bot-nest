import type { AlmanacCategory, AlmanacSummary } from '@/api/modules/almanac'

export const DEFAULT_SUMMARY: AlmanacSummary = {
  level: 0,
  exp: 0,
  nextLevelExp: 0,
  progressPercent: 0,
  rewardFlag: 0,
  rewardBoxVisible: false,
  rewardBoxEnabled: false,
  rewardBoxRedDot: false,
  rewardBoxClaimable: false,
  rewardBoxClaimableRaw: false,
  rewardBoxPreview: null,
  litCount: 0,
  newCount: 0,
  totalCount: 0,
  categoryCounts: {
    normal: 0,
    treasure: 0,
    unknown: 0
  }
}

export const LEVEL_LABELS: Record<number, { text: string, color: string }> = {
  0: { text: '普通', color: 'default' },
  1: { text: '普通', color: 'default' },
  200: { text: '稀有', color: 'blue' },
  201: { text: '珍贵', color: 'purple' },
  202: { text: '传说', color: 'gold' }
}

export function getCategoryTagColor(cat: AlmanacCategory | string): string {
  if (cat === 'treasure')
    return 'orange'
  if (cat === 'normal')
    return 'green'
  return 'default'
}

export function getStatusTagColor(item: { isNew?: boolean, lit?: boolean }): string {
  if (item.isNew)
    return 'gold'
  if (item.lit)
    return 'green'
  return 'default'
}

export function getLevelTag(level: number | null): { text: string, color: string } {
  if (level == null)
    return LEVEL_LABELS[0]
  return LEVEL_LABELS[level] ?? LEVEL_LABELS[0]
}
