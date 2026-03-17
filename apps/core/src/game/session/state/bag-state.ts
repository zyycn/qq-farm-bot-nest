import type { GameConfigService } from '../../game-config.service'
import { toNum } from '../../utils'
import { extractBagItems, formatBagDetail, getBagItemKey, getBagSeeds, getMergedBagItemCount } from '../helpers/bag.helpers'

export class BagState {
  private itemByKey = new Map<string, any>()
  private version = 0

  applyFull(bagReply: any): boolean {
    this.itemByKey.clear()
    for (const item of extractBagItems(bagReply)) {
      const key = getBagItemKey(item)
      this.itemByKey.set(key, { ...item })
    }
    this.version++
    return true
  }

  applyDelta(itemChanges: any[]): boolean {
    const list = Array.isArray(itemChanges) ? itemChanges : []
    if (!list.length)
      return false

    for (const change of list) {
      const nextItem = change?.item ?? change
      const key = getBagItemKey(nextItem)
      const nextCount = toNum(nextItem?.count)
      const delta = toNum(change?.delta)
      const existing = this.itemByKey.get(key)

      if (nextCount > 0) {
        this.itemByKey.set(key, { ...(existing || {}), ...nextItem, count: nextCount })
        continue
      }

      if (existing) {
        const mergedCount = Math.max(0, toNum(existing?.count) + delta)
        if (mergedCount > 0)
          this.itemByKey.set(key, { ...existing, ...nextItem, count: mergedCount })
        else
          this.itemByKey.delete(key)
        continue
      }

      if (nextCount > 0)
        this.itemByKey.set(key, { ...nextItem, count: nextCount })
    }

    this.version++
    return true
  }

  getVersion(): number {
    return this.version
  }

  getRawItems(): any[] {
    return [...this.itemByKey.values()].sort((a, b) => {
      const idDiff = toNum(a?.id) - toNum(b?.id)
      if (idDiff !== 0)
        return idDiff
      return toNum(a?.uid) - toNum(b?.uid)
    })
  }

  getDetailSnapshot(gameConfig: GameConfigService) {
    return formatBagDetail(this.getRawItems(), gameConfig)
  }

  getSeedSnapshot(gameConfig: GameConfigService) {
    return getBagSeeds(this.getRawItems(), gameConfig)
  }

  getItemCount(itemId: number): number {
    return getMergedBagItemCount(this.getRawItems(), itemId)
  }
}
