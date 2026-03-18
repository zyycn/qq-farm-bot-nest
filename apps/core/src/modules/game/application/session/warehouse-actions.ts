import type { AccountConfigService } from '@/modules/account/persistence/account-config.service'
import type { GameConfigService } from '@/modules/game/application/game-config.service'
import type { StatsTracker } from '@/modules/game/application/workers/stats.worker'
import type { IGameTransport } from '@/modules/game/interfaces/game-transport.interface'
import { Logger } from '@nestjs/common'
import { GameRpcExecutor } from '@/modules/game/application/rpc/game-rpc-executor'
import { getDateKey, toNum } from '@/modules/game/domain/utils'

const SELL_BATCH_SIZE = 15
const FERTILIZER_RELATED_IDS = new Set([100003, 100004, 80001, 80002, 80003, 80004, 80011, 80012, 80013, 80014])
const FERTILIZER_CONTAINER_LIMIT_HOURS = 990
const NORMAL_CONTAINER_ID = 1011
const ORGANIC_CONTAINER_ID = 1012
const NORMAL_FERTILIZER_ITEM_HOURS = new Map<number, number>([[80001, 1], [80002, 4], [80003, 8], [80004, 12]])
const ORGANIC_FERTILIZER_ITEM_HOURS = new Map<number, number>([[80011, 1], [80012, 4], [80013, 8], [80014, 12]])
const GIFT_PACK_TYPE = new Map<number, 'normal' | 'organic'>([[100003, 'normal'], [100004, 'organic']])

export interface WarehouseActionsOptions {
  onLog?: (entry: { msg: string, tag?: string, meta?: Record<string, string>, isWarn?: boolean }) => void
  getRawBagItems: () => any[]
}

export class WarehouseActions {
  private readonly logger: Logger
  private readonly rpc: GameRpcExecutor
  private fertilizerGiftDoneDateKey = ''
  private fertilizerGiftLastOpenAt = 0
  constructor(
    private readonly accountId: string,
    private readonly client: IGameTransport,
    private readonly gameConfig: GameConfigService,
    private readonly accountConfig: AccountConfigService,
    private readonly stats: StatsTracker | null,
    private readonly options: WarehouseActionsOptions
  ) {
    this.logger = new Logger(`WarehouseActions:${accountId}`)
    this.rpc = new GameRpcExecutor(this.client)
  }

  private log(msg: string, event?: string) {
    this.logger.log(msg)
    this.options.onLog?.({ msg, tag: '仓库', meta: { module: 'warehouse', ...(event && { event }) }, isWarn: false })
  }

  private warn(msg: string, event?: string) {
    this.logger.warn(msg)
    this.options.onLog?.({ msg, tag: '仓库', meta: { module: 'warehouse', ...(event && { event }) }, isWarn: true })
  }

  async syncBag(): Promise<any> {
    const { data } = await this.rpc.call('warehouse.bag', {})
    return data ?? {}
  }

  async sellItems(items: any[]): Promise<any> {
    const payload = items.map((item: any) => {
      const next: any = { id: toNum(item?.id), count: toNum(item?.count) }
      const uid = toNum(item?.uid)
      if (uid > 0)
        next.uid = uid
      return next
    })
    const { data } = await this.rpc.call('warehouse.sell', { items: payload })
    return data ?? {}
  }

  async sellItemByIdAndCount(itemId: number, count: number): Promise<any> {
    if (count < 1)
      throw new Error('售卖数量必须大于 0')

    const idNum = toNum(itemId)
    let remaining = count
    const toSell: any[] = []
    for (const item of this.options.getRawBagItems()) {
      if (remaining <= 0)
        break
      if (toNum(item?.id) !== idNum)
        continue
      const stackCount = toNum(item?.count)
      const uid = toNum(item?.uid)
      if (stackCount <= 0)
        continue
      const take = Math.min(stackCount, remaining)
      toSell.push({ id: idNum, count: take, uid })
      remaining -= take
    }

    if (!toSell.length)
      throw new Error('背包中无该物品或数量不足')
    if (remaining > 0)
      throw new Error('背包中该物品数量不足')

    const result = await this.sellItems(toSell)
    const earned = this.getGoldFromItems(result?.get_items || [])
    const totalCount = toSell.reduce((sum, item) => sum + (Number(item?.count) || 0), 0)
    const name = this.gameConfig.getItemName(idNum)
    this.log(`出售 ${name} x${totalCount}${earned > 0 ? `，获得 ${earned} 金币` : ''}`, 'sell_success')
    return result
  }

  async useItem(itemId: number, count = 1, landIds: number[] = []): Promise<any> {
    try {
      const { data } = await this.rpc.call('warehouse.use', {
        param: { item_id: itemId, count, land_ids: landIds }
      })
      return data ?? {}
    } catch (error: any) {
      const msg = String(error?.message || '')
      if (!msg.includes('code=1000020') && !msg.includes('请求参数错误'))
        throw error
      const { data } = await this.rpc.call('warehouse.use', {
        param: { item_id: itemId, count }
      })
      return data ?? {}
    }
  }

  async batchUseItems(items: { itemId: number, count: number, uid?: number }[]): Promise<any> {
    const payload = items.map(item => ({ id: item.itemId, count: item.count || 1, uid: item.uid || 0 }))
    const { data } = await this.rpc.call('warehouse.batchUse', { items: payload })
    return data ?? {}
  }

  async sellAllFruits(): Promise<number> {
    if (!this.accountConfig.isAutomationOn('sell', this.accountId))
      return 0

    try {
      const rawItems = this.options.getRawBagItems()
      const toSell: any[] = []
      const names: string[] = []
      for (const item of rawItems) {
        const id = toNum(item?.id)
        const count = toNum(item?.count)
        const plant = this.gameConfig.getPlantByFruitId(id)
        const info = this.gameConfig.getItemById(id)
        const isFruitType = info && (Number(info.type) === 6 || Number(info.type) === 17)
        if ((plant || isFruitType) && count > 0) {
          toSell.push(item)
          const name = plant ? this.gameConfig.getFruitName(id) : (info?.name || `果实${id}`)
          names.push(`${name}x${count}`)
        }
      }

      if (!toSell.length)
        return 0

      const goldBefore = Number(this.client.userState?.gold || 0)
      let serverGoldTotal = 0
      for (let i = 0; i < toSell.length; i += SELL_BATCH_SIZE) {
        const batch = toSell.slice(i, i + SELL_BATCH_SIZE)
        try {
          const reply = await this.sellItems(batch)
          serverGoldTotal += Math.max(0, this.getGoldFromItems(reply?.get_items || []))
        } catch {
          for (const item of batch) {
            try {
              const reply = await this.sellItems([item])
              serverGoldTotal += Math.max(0, this.getGoldFromItems(reply?.get_items || []))
            } catch {}
          }
        }
      }
      const goldAfter = Number(this.client.userState?.gold || 0)
      const totalGoldEarned = Math.max(serverGoldTotal, goldAfter > goldBefore ? goldAfter - goldBefore : 0)
      this.log(`出售 ${names.join(', ')}${totalGoldEarned > 0 ? `，获得 ${totalGoldEarned} 金币` : ''}`, 'sell_success')
      this.stats?.recordOperation('sell', toSell.length)
      return toSell.length
    } catch (error: any) {
      this.warn(`出售失败: ${error?.message}`, 'sell_success')
      return 0
    }
  }

  async autoOpenFertilizerGiftPacks(): Promise<number> {
    try {
      const bagItems = this.options.getRawBagItems()

      const containerHours = { normal: 0, organic: 0 }
      for (const item of bagItems) {
        const id = toNum(item?.id)
        const count = Math.max(0, toNum(item?.count))
        if (id === NORMAL_CONTAINER_ID)
          containerHours.normal = count / 3600
        if (id === ORGANIC_CONTAINER_ID)
          containerHours.organic = count / 3600
      }

      const giftPacks: Array<{ itemId: number, count: number, uid: number, type: 'normal' | 'organic' }> = []
      const fertilizerStacks: Array<{ itemId: number, count: number, uid: number, type: 'normal' | 'organic', perItemHours: number }> = []

      for (const item of bagItems) {
        const id = toNum(item?.id)
        const count = Math.max(0, toNum(item?.count))
        const uid = toNum(item?.uid)
        if (id <= 0 || count <= 0 || !this.isFertilizerRelatedItemId(id))
          continue

        const giftType = GIFT_PACK_TYPE.get(id)
        if (giftType) {
          giftPacks.push({ itemId: id, count, uid, type: giftType })
          continue
        }

        const { type, perItemHours } = this.getFertilizerItemTypeAndHours(id)
        if ((type === 'normal' || type === 'organic') && perItemHours > 0)
          fertilizerStacks.push({ itemId: id, count, uid, type, perItemHours })
      }

      if (!fertilizerStacks.length && !giftPacks.length)
        return 0

      let opened = 0
      const details: string[] = []

      for (const pack of giftPacks) {
        if (containerHours[pack.type] >= FERTILIZER_CONTAINER_LIMIT_HOURS)
          continue
        try {
          await this.batchUseItems([{ itemId: pack.itemId, count: pack.count, uid: pack.uid }])
          opened += pack.count
          details.push(`${this.gameConfig.getItemName(pack.itemId)}x${pack.count}`)
          containerHours[pack.type] += pack.count
        } catch (e: any) {
          this.logger.warn(`开启化肥礼包 ${pack.itemId} 失败: ${e?.message}`)
        }
      }

      for (const stack of fertilizerStacks) {
        const currentHours = containerHours[stack.type]
        if (currentHours >= FERTILIZER_CONTAINER_LIMIT_HOURS)
          continue
        const maxCount = Math.floor(Math.max(0, FERTILIZER_CONTAINER_LIMIT_HOURS - currentHours) / stack.perItemHours)
        if (maxCount <= 0)
          continue
        const useCount = Math.min(stack.count, maxCount)
        try {
          const reply = await this.batchUseItems([{ itemId: stack.itemId, count: useCount, uid: stack.uid }])
          const actualUsed = this.getActualUsedCount(reply, stack.itemId, useCount)
          opened += actualUsed
          details.push(`${this.gameConfig.getItemName(stack.itemId)}x${actualUsed}`)
          if (stack.type === 'normal')
            containerHours.normal += actualUsed * stack.perItemHours
          else
            containerHours.organic += actualUsed * stack.perItemHours
        } catch (e: any) {
          this.logger.warn(`使用化肥 ${stack.itemId} x${useCount} 失败: ${e?.message}`)
        }
      }

      if (opened > 0) {
        this.fertilizerGiftDoneDateKey = getDateKey()
        this.fertilizerGiftLastOpenAt = Date.now()
        this.log(`自动使用化肥类道具 x${opened}${details.length ? ` [${details.join('，')}]` : ''}`, 'fertilizer_gift_open')
      }

      return opened
    } catch (error: any) {
      const msg = String(error?.message || '')
      if (msg.includes('code=1003002') || msg.includes('化肥容器已'))
        return 0
      this.warn(`开启化肥礼包失败: ${msg}`, 'fertilizer_gift_open')
      return 0
    }
  }

  private getActualUsedCount(reply: any, itemId: number, requestedCount: number): number {
    const usedItems = reply?.used_items
    if (Array.isArray(usedItems)) {
      for (const item of usedItems) {
        if (toNum(item?.id) === itemId) {
          const c = toNum(item?.count)
          if (c > 0)
            return c
        }
      }
    }
    return requestedCount
  }

  getFertilizerGiftDailyState() {
    return {
      key: 'fertilizer_gift_open',
      doneToday: this.fertilizerGiftDoneDateKey === getDateKey(),
      lastOpenAt: this.fertilizerGiftLastOpenAt
    }
  }

  private getGoldFromItems(items: any[]): number {
    for (const item of items || []) {
      const id = toNum(item?.id)
      if ((id === 1 || id === 1001) && toNum(item?.count) > 0)
        return toNum(item?.count)
    }
    return 0
  }

  private isFertilizerRelatedItemId(itemId: number): boolean {
    if (itemId <= 0 || itemId === NORMAL_CONTAINER_ID || itemId === ORGANIC_CONTAINER_ID)
      return false
    if (FERTILIZER_RELATED_IDS.has(itemId))
      return true
    const info = this.gameConfig.getItemById(itemId)
    if (!info)
      return false
    const interactionType = String(info.interaction_type || '').toLowerCase()
    return interactionType === 'fertilizer' || interactionType === 'fertilizerpro'
  }

  private getFertilizerItemTypeAndHours(itemId: number) {
    if (NORMAL_FERTILIZER_ITEM_HOURS.has(itemId))
      return { type: 'normal' as const, perItemHours: NORMAL_FERTILIZER_ITEM_HOURS.get(itemId)! }
    if (ORGANIC_FERTILIZER_ITEM_HOURS.has(itemId))
      return { type: 'organic' as const, perItemHours: ORGANIC_FERTILIZER_ITEM_HOURS.get(itemId)! }
    const info = this.gameConfig.getItemById(itemId) || {} as any
    const interactionType = String(info.interaction_type || '').toLowerCase()
    if (interactionType === 'fertilizer')
      return { type: 'normal' as const, perItemHours: 1 }
    if (interactionType === 'fertilizerpro')
      return { type: 'organic' as const, perItemHours: 1 }
    return { type: 'other' as const, perItemHours: 0 }
  }
}
