import type { GameConfigService } from '../../game-config.service'
import { toNum } from '../../utils'

const ITEM_TYPE_PRIORITY = new Map<number, number>([[17, 0], [5, 1], [6, 2]])

export function extractBagItems(bagReply: any): any[] {
  if (bagReply?.item_bag?.items?.length)
    return bagReply.item_bag.items
  return bagReply?.items || []
}

export function getBagItemKey(item: any): string {
  const uid = toNum(item?.uid)
  const id = toNum(item?.id)
  if (uid > 0)
    return `uid:${uid}`
  return `id:${id}`
}

export function getMergedBagItemCount(items: any[], itemId: number): number {
  const targetId = toNum(itemId)
  return (items || []).reduce((sum, item) => {
    if (toNum(item?.id) !== targetId)
      return sum
    return sum + Math.max(0, toNum(item?.count))
  }, 0)
}

export function formatBagDetail(items: any[], gameConfig: GameConfigService) {
  const merged = new Map<number, any>()

  for (const item of items || []) {
    const id = toNum(item?.id)
    const count = toNum(item?.count)
    if (id <= 0 || count <= 0)
      continue

    const info = gameConfig.getItemById(id)
    let name = info?.name || ''
    let category = 'item'
    if (id === 1 || id === 1001) {
      name = '金币'
      category = 'gold'
    } else if (id === 1101) {
      name = '经验'
      category = 'exp'
    } else if (gameConfig.getPlantByFruitId(id) || (info && (Number(info.type) === 6 || Number(info.type) === 17))) {
      const plantName = gameConfig.getPlantByFruitId(id)?.name
      name = name || (plantName ? `${plantName}果实` : `果实${id}`)
      category = 'fruit'
    } else if (gameConfig.getPlantBySeedId(id)) {
      const plant = gameConfig.getPlantBySeedId(id)
      name = name || `${plant?.name || '未知'}种子`
      category = 'seed'
    }

    if (!name)
      name = `物品${id}`

    if (!merged.has(id)) {
      merged.set(id, {
        id,
        count: 0,
        uid: 0,
        name,
        image: gameConfig.getItemImageById(id),
        category,
        itemType: info ? (Number(info.type) || 0) : 0,
        priceId: info ? (Number(info.price_id) || 0) : 0,
        price: info ? (Number(info.price) || 0) : 0,
        priceUnit: Number(info?.price_id) === 1005 ? '金豆豆' : Number(info?.price_id) === 1002 ? '点券' : '金',
        level: info ? (Number(info.level) || 0) : 0,
        interactionType: info?.interaction_type ? String(info.interaction_type) : '',
        hoursText: ''
      })
    }

    merged.get(id)!.count += count
  }

  const result = Array.from(merged.values(), (row) => {
    if (row.interactionType === 'fertilizerbucket' && row.count > 0)
      row.hoursText = `${(Math.floor((row.count / 3600) * 10) / 10).toFixed(1)}小时`
    return row
  })

  result.sort((a, b) => {
    const getPriority = (itemType: number): number => {
      const direct = ITEM_TYPE_PRIORITY.get(itemType)
      if (direct != null)
        return direct
      return itemType > 0 ? 1000 + itemType : Number.MAX_SAFE_INTEGER
    }

    const pa = getPriority(Number(a.itemType || 0))
    const pb = getPriority(Number(b.itemType || 0))
    if (pa !== pb)
      return pa - pb

    const ca = Number(a.count || 0)
    const cb = Number(b.count || 0)
    if (cb !== ca)
      return cb - ca

    return Number(a.id || 0) - Number(b.id || 0)
  })

  return { totalKinds: result.length, items: result }
}

export function getBagSeeds(items: any[], gameConfig: GameConfigService): Array<{ seedId: number, name: string, count: number, requiredLevel: number, image: string, plantSize: number }> {
  const merged = new Map<number, {
    seedId: number
    name: string
    count: number
    requiredLevel: number
    image: string
    plantSize: number
  }>()

  for (const item of items || []) {
    const id = toNum(item?.id)
    const count = toNum(item?.count)
    if (id <= 0 || count <= 0)
      continue

    const plant = gameConfig.getPlantBySeedId(id)
    if (!plant)
      continue

    if (!merged.has(id)) {
      merged.set(id, {
        seedId: id,
        name: plant.name || `种子${id}`,
        count: 0,
        requiredLevel: Number((plant as any)?.land_level_need) || 0,
        image: gameConfig.getSeedImageBySeedId(id),
        plantSize: Math.max(1, Number((plant as any)?.size) || 1)
      })
    }

    merged.get(id)!.count += count
  }

  return [...merged.values()].sort((a, b) => b.requiredLevel - a.requiredLevel)
}
