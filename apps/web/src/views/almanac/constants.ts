import type { AlmanacItem } from '@/api/modules/almanac'

export type AlmanacCategoryFilter = 'all' | AlmanacItem['category']
export type AlmanacStatusFilter = 'all' | 'lit' | 'new' | 'unlit'

export const CATEGORY_OPTIONS: Array<{ key: AlmanacCategoryFilter, label: string, icon: string }> = [
  { key: 'all', label: '全部', icon: 'i-streamline-emojis-open-book' },
  { key: 'normal', label: '普通图鉴', icon: 'i-streamline-emojis-herb' },
  { key: 'treasure', label: '珍藏图鉴', icon: 'i-streamline-emojis-sparkles' },
  { key: 'unknown', label: '未分类', icon: 'i-streamline-emojis-package' }
]

export const STATUS_OPTIONS: Array<{ key: AlmanacStatusFilter, label: string, icon: string }> = [
  { key: 'all', label: '全部状态', icon: 'i-streamline-emojis-open-book' },
  { key: 'lit', label: '已点亮', icon: 'i-streamline-emojis-sparkles' },
  { key: 'new', label: '新品项', icon: 'i-streamline-emojis-package' },
  { key: 'unlit', label: '未点亮', icon: 'i-streamline-emojis-seedling' }
]

export function getRarityTagColor(rarity: number): string {
  if (rarity >= 4)
    return 'gold'
  if (rarity >= 3)
    return 'geekblue'
  if (rarity >= 2)
    return 'cyan'
  return 'default'
}

export function getCategoryTagColor(category: AlmanacItem['category']): string {
  if (category === 'treasure')
    return 'orange'
  if (category === 'normal')
    return 'green'
  return 'default'
}

export function getStatusTagColor(item: Pick<AlmanacItem, 'lit' | 'isNew'>): string {
  if (item.isNew)
    return 'gold'
  if (item.lit)
    return 'green'
  return 'default'
}
