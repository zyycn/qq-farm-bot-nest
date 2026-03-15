import type { StoreService } from '../../store/store.service'
import type { GameConfigService } from '../game-config.service'
import type { IGameTransport } from '../interfaces/game-transport.interface'
import type { StatsTracker } from './stats.worker'
import { Logger } from '@nestjs/common'
import { getDateKey, sleep, toNum } from '../utils'

const SELL_BATCH_SIZE = 15
const FERTILIZER_RELATED_IDS = new Set([100003, 100004, 80001, 80002, 80003, 80004, 80011, 80012, 80013, 80014])
const FERTILIZER_CONTAINER_LIMIT_HOURS = 990
const NORMAL_CONTAINER_ID = 1011
const ORGANIC_CONTAINER_ID = 1012
const NORMAL_FERTILIZER_ITEM_HOURS = new Map([[80001, 1], [80002, 4], [80003, 8], [80004, 12]])
const ORGANIC_FERTILIZER_ITEM_HOURS = new Map([[80011, 1], [80012, 4], [80013, 8], [80014, 12]])
const ITEM_TYPE_PRIORITY = new Map<number, number>([[17, 0], [5, 1], [6, 2]])

export class WarehouseWorker {
  private logger: Logger
  private fertilizerGiftDoneDateKey = ''
  private fertilizerGiftLastOpenAt = 0
  private bagCache: { data: any, ts: number } | null = null
  private static readonly BAG_CACHE_TTL = 30_000
  onLog: ((entry: { msg: string, tag?: string, meta?: Record<string, string>, isWarn?: boolean }) => void) | null = null

  constructor(
    private accountId: string,
    private client: IGameTransport,
    private gameConfig: GameConfigService,
    private store: StoreService,
    private stats: StatsTracker | null = null
  ) {
    this.logger = new Logger(`Warehouse:${accountId}`)
  }

  private log(msg: string, event?: string) {
    this.logger.log(msg)
    this.onLog?.({ msg, tag: '仓库', meta: { module: 'warehouse', ...(event && { event }) }, isWarn: false })
  }

  private warn(msg: string, event?: string) {
    this.logger.warn(msg)
    this.onLog?.({ msg, tag: '仓库', meta: { module: 'warehouse', ...(event && { event }) }, isWarn: true })
  }

  // ========== API ==========

  async getBag(forceRefresh = false): Promise<any> {
    if (!forceRefresh && this.bagCache && Date.now() - this.bagCache.ts < WarehouseWorker.BAG_CACHE_TTL)
      return this.bagCache.data
    const { data } = await this.client.invoke('gamepb.itempb.ItemService', 'Bag', {})
    const next = data ?? {}
    this.bagCache = { data: next, ts: Date.now() }
    return next
  }

  invalidateBagCache() {
    this.bagCache = null
  }

  getBagItems(bagReply: any): any[] {
    if (bagReply?.item_bag?.items?.length)
      return bagReply.item_bag.items
    return bagReply?.items || []
  }

  async sellItems(items: any[]): Promise<any> {
    const payload = items.map((item: any) => {
      const p: any = { id: toNum(item?.id), count: toNum(item?.count) }
      const uid = toNum(item?.uid)
      if (uid > 0)
        p.uid = uid
      return p
    })
    const { data } = await this.client.invoke('gamepb.itempb.ItemService', 'Sell', { items: payload })
    this.invalidateBagCache()
    return data ?? {}
  }

  /** 按 itemId + count 售卖：从原始背包解析 uid，满足服务端请求参数要求 */
  async sellItemByIdAndCount(itemId: number, count: number): Promise<any> {
    if (count < 1)
      throw new Error('售卖数量必须大于 0')
    const bagReply = await this.getBag()
    const rawItems = this.getBagItems(bagReply)
    const idNum = toNum(itemId)
    let remaining = count
    const toSell: any[] = []
    for (const it of rawItems) {
      if (remaining <= 0)
        break
      if (toNum(it.id) !== idNum)
        continue
      const stackCount = toNum(it.count)
      const uid = toNum(it.uid)
      if (stackCount <= 0)
        continue
      const take = Math.min(stackCount, remaining)
      toSell.push({ id: itemId, count: take, uid })
      remaining -= take
    }
    if (toSell.length === 0)
      throw new Error('背包中无该物品或数量不足')
    if (remaining > 0)
      throw new Error('背包中该物品数量不足')
    const result = await this.sellItems(toSell)
    const earned = this.getGoldFromItems(result?.get_items || [])
    const totalCount = toSell.reduce((acc, curr) => acc + (Number(curr.count) || 0), 0)
    const name = this.gameConfig.getItemName(itemId)
    this.log(`出售 ${name} x${totalCount}${earned > 0 ? `，获得 ${earned} 金币` : ''}`, 'sell_success')
    return result
  }

  async useItem(itemId: number, count = 1, landIds: number[] = []): Promise<any> {
    try {
      const { data } = await this.client.invoke('gamepb.itempb.ItemService', 'Use', {
        param: { item_id: itemId, count, land_ids: landIds }
      })
      this.invalidateBagCache()
      return data ?? {}
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (!msg.includes('code=1000020') && !msg.includes('请求参数错误'))
        throw e
      const { data } = await this.client.invoke('gamepb.itempb.ItemService', 'Use', { param: { item_id: itemId, count } })
      this.invalidateBagCache()
      return data ?? {}
    }
  }

  async batchUseItems(items: { itemId: number, count: number, uid?: number }[]): Promise<any> {
    const payload = items.map(it => ({ id: it.itemId, count: it.count || 1, uid: it.uid || 0 }))
    const { data } = await this.client.invoke('gamepb.itempb.ItemService', 'BatchUse', { items: payload })
    this.invalidateBagCache()
    return data ?? {}
  }

  // ========== Fertilizer Gift Packs ==========

  private isFertilizerRelatedItemId(itemId: number): boolean {
    if (itemId <= 0 || itemId === 1011 || itemId === 1012)
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

  async autoOpenFertilizerGiftPacks(): Promise<number> {
    try {
      const bagReply = await this.getBag()
      const bagItems = this.getBagItems(bagReply)

      const merged = new Map<number, number>()
      for (const it of bagItems) {
        const id = toNum(it?.id)
        const count = Math.max(0, toNum(it?.count))
        if (id > 0 && count > 0 && this.isFertilizerRelatedItemId(id))
          merged.set(id, (merged.get(id) || 0) + count)
      }
      if (!merged.size)
        return 0

      const containerHours = { normal: 0, organic: 0 }
      for (const it of bagItems) {
        const id = toNum(it?.id)
        const count = Math.max(0, toNum(it?.count))
        if (id === NORMAL_CONTAINER_ID)
          containerHours.normal = count / 3600
        if (id === ORGANIC_CONTAINER_ID)
          containerHours.organic = count / 3600
      }

      let opened = 0
      const details: string[] = []
      for (const [itemId, rawCount] of merged) {
        const { type, perItemHours } = this.getFertilizerItemTypeAndHours(itemId)
        if (type === 'normal' || type === 'organic') {
          const currentHours = type === 'normal' ? containerHours.normal : containerHours.organic
          if (currentHours >= FERTILIZER_CONTAINER_LIMIT_HOURS)
            continue
          if (perItemHours > 0) {
            const maxCount = Math.floor(Math.max(0, FERTILIZER_CONTAINER_LIMIT_HOURS - currentHours) / perItemHours)
            if (maxCount <= 0)
              continue
            const useCount = Math.min(rawCount, maxCount)
            try {
              await this.batchUseItems([{ itemId, count: useCount }])
              opened += useCount
              details.push(`${this.gameConfig.getItemName(itemId)}x${useCount}`)
              if (type === 'normal')
                containerHours.normal += useCount * perItemHours
              else
                containerHours.organic += useCount * perItemHours
            } catch {
              continue
            }
          }
        }
        await sleep(100)
      }

      if (opened > 0) {
        this.fertilizerGiftDoneDateKey = getDateKey()
        this.fertilizerGiftLastOpenAt = Date.now()
        this.log(`自动使用化肥类道具 x${opened}${details.length ? ` [${details.join('，')}]` : ''}`, 'fertilizer_gift_open')
      }
      return opened
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (msg.includes('code=1003002') || msg.includes('化肥容器已'))
        return 0
      this.warn(`开启化肥礼包失败: ${msg}`, 'fertilizer_gift_open')
      return 0
    }
  }

  // ========== Sell Fruits ==========

  private getGoldFromItems(items: any[]): number {
    for (const item of (items || [])) {
      const id = toNum(item.id)
      if ((id === 1 || id === 1001) && toNum(item.count) > 0)
        return toNum(item.count)
    }
    return 0
  }

  async sellAllFruits() {
    if (!this.store.isAutomationOn('sell', this.accountId))
      return
    try {
      const bagReply = await this.getBag()
      const items = this.getBagItems(bagReply)
      const toSell: any[] = []
      const names: string[] = []
      for (const item of items) {
        const id = toNum(item.id)
        const count = toNum(item.count)
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
        return

      const goldBefore = Number(this.client.userState?.gold || 0)
      let serverGoldTotal = 0
      for (let i = 0; i < toSell.length; i += SELL_BATCH_SIZE) {
        const batch = toSell.slice(i, i + SELL_BATCH_SIZE)
        try {
          const reply = await this.sellItems(batch)
          const gain = Math.max(0, this.getGoldFromItems(reply?.get_items || []))
          if (gain > 0)
            serverGoldTotal += gain
        } catch {
          for (const it of batch) {
            try {
              const r = await this.sellItems([it])
              const g = Math.max(0, this.getGoldFromItems(r?.get_items || []))
              if (g > 0)
                serverGoldTotal += g
            } catch {}
          }
        }
        if (i + SELL_BATCH_SIZE < toSell.length)
          await sleep(300)
      }

      await sleep(500)
      const goldAfter = Number(this.client.userState?.gold || 0)
      const totalGoldEarned = Math.max(serverGoldTotal, goldAfter > goldBefore ? goldAfter - goldBefore : 0)
      this.log(`出售 ${names.join(', ')}${totalGoldEarned > 0 ? `，获得 ${totalGoldEarned} 金币` : ''}`, 'sell_success')
      this.stats?.recordOperation('sell', toSell.length)
      if (totalGoldEarned > 0)
        this.client.emit('sell', totalGoldEarned)
    } catch (e: any) { this.warn(`出售失败: ${e?.message}`, 'sell_success') }
  }

  // ========== Bag Detail ==========

  async getBagDetail() {
    const bagReply = await this.getBag()
    const rawItems = this.getBagItems(bagReply)
    const merged = new Map<number, any>()
    for (const it of rawItems) {
      const id = toNum(it.id)
      const count = toNum(it.count)
      if (id <= 0 || count <= 0)
        continue
      const info = this.gameConfig.getItemById(id)
      let name = info?.name || ''
      let category = 'item'
      if (id === 1 || id === 1001) {
        name = '金币'
        category = 'gold'
      } else if (id === 1101) {
        name = '经验'
        category = 'exp'
      } else if (this.gameConfig.getPlantByFruitId(id) || (info && (Number(info.type) === 6 || Number(info.type) === 17))) {
        const plantName = this.gameConfig.getPlantByFruitId(id)?.name
        name = name || (plantName ? `${plantName}果实` : `果实${id}`)
        category = 'fruit'
      } else if (this.gameConfig.getPlantBySeedId(id)) {
        const p = this.gameConfig.getPlantBySeedId(id)
        name = name || `${p?.name || '未知'}种子`
        category = 'seed'
      }
      if (!name)
        name = `物品${id}`
      const interactionType = info?.interaction_type ? String(info.interaction_type) : ''
      const priceId = info ? (Number(info.price_id) || 0) : 0
      const priceUnit = priceId === 1005 ? '金豆豆' : priceId === 1002 ? '点券' : '金'

      if (!merged.has(id)) {
        merged.set(id, {
          id,
          count: 0,
          uid: 0,
          name,
          image: this.gameConfig.getItemImageById(id),
          category,
          itemType: info ? (Number(info.type) || 0) : 0,
          priceId,
          price: info ? (Number(info.price) || 0) : 0,
          priceUnit,
          level: info ? (Number(info.level) || 0) : 0,
          interactionType,
          hoursText: ''
        })
      }
      merged.get(id)!.count += count
    }

    const items = Array.from(merged.values(), (row) => {
      if (row.interactionType === 'fertilizerbucket' && row.count > 0) {
        row.hoursText = `${(Math.floor((row.count / 3600) * 10) / 10).toFixed(1)}小时`
      }
      return row
    })
    items.sort((a, b) => {
      const taRaw = Number(a.itemType || 0)
      const tbRaw = Number(b.itemType || 0)

      const getPriority = (t: number): number => {
        const fromMap = ITEM_TYPE_PRIORITY.get(t)
        if (fromMap != null)
          return fromMap
        return t > 0 ? 1000 + t : Number.MAX_SAFE_INTEGER
      }

      const ta = getPriority(taRaw)
      const tb = getPriority(tbRaw)
      if (ta !== tb)
        return ta - tb

      const ca = Number(a.count || 0)
      const cb = Number(b.count || 0)
      if (cb !== ca)
        return cb - ca

      return Number(a.id || 0) - Number(b.id || 0)
    })
    return { totalKinds: items.length, items }
  }

  async getBagSeeds(): Promise<Array<{ seedId: number, name: string, count: number, requiredLevel: number, image: string, plantSize: number }>> {
    const bagReply = await this.getBag()
    const rawItems = this.getBagItems(bagReply)
    const merged = new Map<number, {
      seedId: number
      name: string
      count: number
      requiredLevel: number
      image: string
      plantSize: number
    }>()

    for (const it of rawItems) {
      const id = toNum(it.id)
      const count = toNum(it.count)
      if (id <= 0 || count <= 0)
        continue
      const plant = this.gameConfig.getPlantBySeedId(id)
      if (!plant)
        continue

      if (!merged.has(id)) {
        merged.set(id, {
          seedId: id,
          name: plant.name || `种子${id}`,
          count: 0,
          requiredLevel: Number((plant as any).land_level_need) || 0,
          image: this.gameConfig.getSeedImageBySeedId(id),
          plantSize: Math.max(1, Number((plant as any).size) || 1)
        })
      }
      merged.get(id)!.count += count
    }

    const seeds = [...merged.values()]
    seeds.sort((a, b) => b.requiredLevel - a.requiredLevel)
    return seeds
  }

  async getCurrentTotalsFromBag() {
    const bagReply = await this.getBag()
    const items = this.getBagItems(bagReply)
    let gold: number | null = null
    let exp: number | null = null
    for (const item of items) {
      const id = toNum(item.id)
      const count = toNum(item.count)
      if (id === 1 || id === 1001)
        gold = count
      if (id === 1101)
        exp = count
    }
    return { gold, exp }
  }

  // ========== State for UI ==========

  getFertilizerGiftDailyState() {
    return { key: 'fertilizer_gift_open', doneToday: this.fertilizerGiftDoneDateKey === getDateKey(), lastOpenAt: this.fertilizerGiftLastOpenAt }
  }
}
