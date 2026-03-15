import type { GameConfigService, ItemInfo, PlantInfo } from '../game-config.service'
import type { IGameTransport } from '../interfaces/game-transport.interface'
import { Logger } from '@nestjs/common'
import { getRewardSummary, toNum } from '../utils'

const CATEGORY_NAME_MAP: Record<string, string> = {
  normal: '普通图鉴',
  treasure: '珍藏图鉴',
  unknown: '未分类'
}

const RARITY_LABEL_MAP: Record<number, string> = {
  1: '普通',
  2: '稀有',
  3: '珍稀',
  4: '典藏',
  5: '传说'
}

const SOURCE_LABEL_MAP: Record<number, string> = {
  11: '种子商店',
  31: '化肥商店',
  32: '商城兑换',
  33: '会员专区'
}

const JUMP_CODE_RE = /\d+/g

type AlmanacCategory = 'normal' | 'treasure' | 'unknown'

interface NormalizedRewardItem {
  itemId: number
  name: string
  count: number
  image: string
}

interface IllustratedSourceContext {
  categoryKey: AlmanacCategory
  plant?: PlantInfo
  seedInfo?: ItemInfo
  fruitInfo?: ItemInfo
}

interface IllustratedSeedContext {
  plant?: PlantInfo
  rawItem?: any
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
  rewardBoxPreview: NormalizedRewardItem | null
  rewardHint: NormalizedRewardItem | null
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
  reward: NormalizedRewardItem | null
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
  items: NormalizedRewardItem[]
  bonusItems: NormalizedRewardItem[]
  summaryText: string
}

export class IllustratedWorker {
  private readonly logger: Logger
  onLog: ((entry: { msg: string, tag?: string, meta?: Record<string, string>, isWarn?: boolean }) => void) | null = null

  constructor(
    private readonly accountId: string,
    private readonly client: IGameTransport,
    private readonly gameConfig: GameConfigService
  ) {
    this.logger = new Logger(`Illustrated:${accountId}`)
  }

  private log(msg: string, event?: string) {
    this.logger.log(msg)
    this.onLog?.({ msg, tag: '图鉴', meta: { module: 'illustrated', ...(event && { event }) }, isWarn: false })
  }

  async getIllustratedList(_refresh = false): Promise<any> {
    const { data } = await this.client.invoke('gamepb.illustratedpb.IllustratedService', 'GetIllustratedListV2', {
      // The server drops the 7 treasure entries when refresh=true, so we
      // always read the full stable list and only use the caller flag to
      // trigger a client-side reload.
      refresh: false,
      full: true
    })
    return data ?? {}
  }

  async claimAllRewards(): Promise<any> {
    const { data } = await this.client.invoke('gamepb.illustratedpb.IllustratedService', 'ClaimAllRewardsV2', {
      only_claimable: true
    })
    return data ?? { items: [], bonus_items: [] }
  }

  async getOverview(refresh = false): Promise<AlmanacOverview> {
    const reply = await this.getIllustratedList(refresh)
    const normalizedItems = this.buildNormalizedItems(Array.isArray(reply?.items) ? reply.items : [])
    const litCount = normalizedItems.filter(item => item.lit).length
    const newCount = normalizedItems.filter(item => item.isNew).length

    const categoryCounts = {
      normal: 0,
      treasure: 0,
      unknown: 0
    } satisfies Record<AlmanacCategory, number>

    for (const item of normalizedItems)
      categoryCounts[item.category]++

    const exp = Math.max(0, toNum(reply?.exp))
    const rawNextLevelExp = Math.max(0, toNum(reply?.next_level_exp))
    const rewardFlag = Math.max(0, toNum(reply?.reward_flag))
    const rewardBoxVisible = !!(reply?.reward_box_visible ?? reply?.reward_box_enabled)
    const rewardBoxEnabled = rewardBoxVisible
    const rewardBoxRedDot = rewardFlag > 0
    const rewardBoxClaimableRaw = !!reply?.reward_box_claimable_raw
    const rewardBoxClaimable = rewardBoxClaimableRaw || rewardBoxRedDot
    const rewardBoxPreview = this.normalizeRewardItem(reply?.reward_box_preview ?? reply?.reward_hint)
    const nextLevelExp = rawNextLevelExp > 0 ? rawNextLevelExp : exp

    return {
      summary: {
        level: Math.max(0, toNum(reply?.level)),
        exp,
        nextLevelExp,
        progressPercent: rawNextLevelExp > 0 ? Math.min(100, Math.round((exp / rawNextLevelExp) * 100)) : 0,
        rewardFlag,
        rewardBoxVisible,
        rewardBoxEnabled,
        rewardBoxRedDot,
        rewardBoxClaimable,
        rewardBoxClaimableRaw,
        rewardBoxPreview,
        rewardHint: rewardBoxPreview,
        litCount,
        newCount,
        totalCount: normalizedItems.length,
        categoryCounts
      },
      items: normalizedItems
    }
  }

  async claimRewards(): Promise<AlmanacClaimResult> {
    const overview = await this.getOverview(true)
    if (!overview.summary.rewardBoxClaimable) {
      return {
        items: [],
        bonusItems: [],
        summaryText: '当前没有可领取的图鉴宝箱'
      }
    }

    const reply = await this.claimAllRewards()
    const items = this.normalizeRewardItemList(reply?.items)
    const bonusItems = this.normalizeRewardItemList(reply?.bonus_items)
    const creditedItems = items.length > 0 ? items : bonusItems

    if (creditedItems.length > 0) {
      this.log(
        `手动领取图鉴宝箱: ${getRewardSummary(
          creditedItems.map(item => ({ id: item.itemId, count: item.count })),
          id => this.gameConfig.getItemName(id)
        )}`,
        'illustrated_rewards'
      )
    }

    return {
      items,
      bonusItems,
      summaryText: creditedItems.length > 0
        ? this.formatRewardText(creditedItems)
        : '宝箱状态已刷新，但这次没有返回有效奖励数据'
    }
  }

  private buildNormalizedItems(rawItems: any[]): AlmanacItem[] {
    const normalizedItems: AlmanacItem[] = []
    const seenFruitIds = new Set<number>()

    for (const rawItem of rawItems) {
      const fruitId = Math.max(0, toNum(rawItem?.fruit_id))
      if (fruitId <= 0 || seenFruitIds.has(fruitId))
        continue

      normalizedItems.push(this.normalizeIllustratedItem({ rawItem }))
      seenFruitIds.add(fruitId)
    }

    return normalizedItems.sort((left, right) => this.compareIllustratedItem(left, right))
  }

  private compareIllustratedItem(left: AlmanacItem, right: AlmanacItem): number {
    const leftOrder = this.getPlantOrder(left.fruitId)
    const rightOrder = this.getPlantOrder(right.fruitId)

    if (leftOrder !== rightOrder)
      return leftOrder - rightOrder

    if (left.quality !== right.quality)
      return left.quality - right.quality

    if (left.rarity !== right.rarity)
      return left.rarity - right.rarity

    return left.fruitId - right.fruitId
  }

  private getPlantOrder(fruitId: number): number {
    const allPlants = this.gameConfig.getAllPlants()
    for (let index = 0; index < allPlants.length; index++) {
      if (toNum(allPlants[index]?.fruit?.id) === fruitId)
        return index
    }
    return Number.MAX_SAFE_INTEGER
  }

  private normalizeIllustratedItem(context: IllustratedSeedContext): AlmanacItem {
    const rawFruitId = Math.max(0, toNum(context.rawItem?.fruit_id))
    const plant = context.plant ?? (rawFruitId > 0 ? this.gameConfig.getPlantByFruitId(rawFruitId) : undefined)
    const fruitId = Math.max(0, rawFruitId || Number(plant?.fruit?.id) || 0)
    const fruitInfo = fruitId > 0 ? this.gameConfig.getItemById(fruitId) : undefined
    const seedId = Math.max(0, Number(plant?.seed_id) || 0)
    const seedInfo = seedId > 0 ? this.gameConfig.getItemById(seedId) : undefined
    const reward = this.normalizeRewardInfo(context.rawItem?.reward_info)
    const rarity = Math.max(
      1,
      toNum(context.rawItem?.rarity) || Number(seedInfo?.rarity) || Number(fruitInfo?.rarity) || 1
    )
    const quality = Math.max(0, toNum(context.rawItem?.quality))
    const category = this.resolveCategory(rarity, seedInfo, fruitInfo)
    const seasons = Math.max(1, Number(plant?.seasons) || 1)
    const growTimeSec = plant ? this.gameConfig.getPlantGrowTime(plant.id) : 0
    const exp = plant ? this.gameConfig.getPlantExp(plant.id) : 0
    const fruitPrice = fruitInfo ? Math.max(0, Number(fruitInfo.price) || 0) : 0
    const priceUnitLabel = this.resolvePriceUnitLabel(fruitInfo)
    const seasonalYield = Math.max(0, Number(plant?.fruit?.count) || 0)
    const seasonalIncome = seasonalYield * fruitPrice
    const lit = toNum(context.rawItem?.lit) > 0
    const litReward = Math.max(0, toNum(context.rawItem?.lit_reward) || reward?.count || 0)
    const isNew = toNum(context.rawItem?.is_new) > 0
    const statusLabel = lit
      ? (isNew ? '新点亮' : '已点亮')
      : '未点亮'
    const baseName = plant?.name || fruitInfo?.name || this.gameConfig.getFruitName(fruitId)
    const detailDescription = lit
      ? `该条目已点亮，点亮时提供 ${litReward || 0} 点图鉴进度`
      : `收获果实后即可点亮图鉴，并获得 ${litReward || 0} 点图鉴进度`

    return {
      fruitId,
      plantId: Math.max(0, Number(plant?.id) || 0),
      seedId,
      name: baseName || `图鉴#${fruitId || seedId || 0}`,
      image: fruitId > 0 ? this.gameConfig.getItemImageById(fruitId) : this.gameConfig.getSeedImageBySeedId(seedId),
      quality,
      qualityLabel: quality > 0 ? `${quality}品` : '',
      rarity,
      rarityLabel: RARITY_LABEL_MAP[rarity] || '普通',
      category,
      categoryLabel: CATEGORY_NAME_MAP[category],
      litReward,
      isNew,
      lit,
      statusLabel,
      reward,
      sourceLabels: this.resolveSourceLabels({ categoryKey: category, plant, seedInfo, fruitInfo }),
      growTimeSec,
      growTimeText: growTimeSec > 0 ? this.gameConfig.formatGrowTime(growTimeSec) : '未知',
      seasons,
      exp,
      fruitPrice,
      fruitPriceLabel: fruitPrice > 0 ? `${fruitPrice} ${priceUnitLabel}/个` : '未知',
      seasonalYield,
      seasonalYieldLabel: seasonalYield > 0 ? `${seasonalYield} 个/季` : '未知',
      seasonalIncome,
      seasonalIncomeLabel: seasonalIncome > 0 ? `${seasonalIncome} ${priceUnitLabel}/季` : `0 ${priceUnitLabel}/季`,
      rewardDescription: litReward > 0 ? `点亮后增加 ${litReward} 点图鉴进度` : '点亮后增加图鉴进度',
      detailDescription
    }
  }

  private normalizeRewardInfo(rewardInfo: any): NormalizedRewardItem | null {
    if (!rewardInfo)
      return null

    return this.normalizeRewardItem({
      id: rewardInfo.reward_id,
      count: rewardInfo.count
    })
  }

  private normalizeRewardItemList(items: any[]): NormalizedRewardItem[] {
    return (Array.isArray(items) ? items : [])
      .map(item => this.normalizeRewardItem(item))
      .filter((item): item is NormalizedRewardItem => !!item)
  }

  private normalizeRewardItem(rawItem: any): NormalizedRewardItem | null {
    const itemId = Math.max(0, toNum(rawItem?.id))
    const count = Math.max(0, toNum(rawItem?.count))
    if (!itemId || count <= 0)
      return null

    return {
      itemId,
      name: this.gameConfig.getItemName(itemId),
      count,
      image: this.gameConfig.getItemImageById(itemId)
    }
  }

  private formatRewardText(items: NormalizedRewardItem[]): string {
    return items.map(item => `${item.name} x${item.count}`).join(' / ')
  }

  private resolveCategory(
    rarity: number,
    seedInfo?: ItemInfo,
    fruitInfo?: ItemInfo
  ): AlmanacCategory {
    if (rarity >= 2)
      return 'treasure'
    if (seedInfo || fruitInfo)
      return 'normal'
    return 'unknown'
  }

  private resolvePriceUnitLabel(itemInfo?: ItemInfo): string {
    const priceId = Math.max(0, Number(itemInfo?.price_id) || 0)
    if (priceId === 1002)
      return '点券'
    if (priceId === 1005)
      return '金豆豆'
    return '金币'
  }

  private resolveSourceLabels(context: IllustratedSourceContext): string[] {
    const labels = new Set<string>()
    const jumpCodes = this.parseJumpCodes(String(context.seedInfo?.jumps || context.fruitInfo?.jumps || ''))

    for (const code of jumpCodes) {
      const label = SOURCE_LABEL_MAP[code]
      if (label)
        labels.add(label)
    }

    const levelNeed = Math.max(0, Number(context.seedInfo?.level) || Number(context.fruitInfo?.level) || 0)
    if (levelNeed > 0)
      labels.add(`Lv.${levelNeed} 解锁`)

    if (!labels.size) {
      if (context.categoryKey === 'treasure')
        labels.add('限定活动')
      else if (context.categoryKey === 'normal')
        labels.add('种子商店')
    }

    if (context.plant && Number(context.plant.seasons) > 1)
      labels.add('多季作物')

    return [...labels]
  }

  private parseJumpCodes(rawValue: string): number[] {
    if (!rawValue)
      return []

    const matches = rawValue.match(JUMP_CODE_RE) || []
    return [...new Set(matches.map(code => Number.parseInt(code, 10)).filter(code => Number.isFinite(code) && code > 0))]
  }
}
