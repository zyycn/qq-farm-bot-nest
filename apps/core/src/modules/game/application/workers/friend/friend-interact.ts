import type { GameConfigService } from '@/modules/game/application/game-config.service'
import type { GameOperationKey } from '@/modules/game/application/rpc/operation-catalog'
import type { IGameTransport } from '@/modules/game/interfaces/game-transport.interface'
import { GameRpcExecutor } from '@/modules/game/application/rpc/game-rpc-executor'
import { toNum, toTimeSec } from '@/modules/game/domain/utils'

export interface FriendInteractRecord {
  key: string
  serverTimeSec: number
  serverTimeMs: number
  actionType: number
  actionLabel: string
  actionDetail: string
  visitorGid: number
  nick: string
  avatarUrl: string
  cropId: number
  cropName: string
  cropCount: number
  times: number
  fromType: number
  level: number
  landId: number
  flag1: number
  flag2: number
}

export class FriendInteractHandler {
  private readonly rpc: GameRpcExecutor
  private readonly interactRpcCandidates: readonly GameOperationKey[] = [
    'friend.interactRecords',
    'friend.getInteractRecords',
    'friend.visitorInteractRecords',
    'friend.visitorGetInteractRecords'
  ]

  constructor(
    private readonly client: IGameTransport,
    private readonly gameConfig: GameConfigService,
    private readonly warn: (msg: string, event?: string) => void
  ) {
    this.rpc = new GameRpcExecutor(this.client)
  }

  async getInteractRecords(): Promise<FriendInteractRecord[]> {
    try {
      const { data: reply } = await this.rpc.callFirstAvailable<any>(this.interactRpcCandidates, {}, { invokeTimeoutMs: 2500 })
      const records = Array.isArray(reply?.records) ? reply.records : []
      return records
        .map((record, index) => this.normalizeInteractRecord(record, index))
        .sort((a, b) => (b.serverTimeSec - a.serverTimeSec) || (b.visitorGid - a.visitorGid) || (b.actionType - a.actionType))
    } catch (error: any) {
      this.warn(`访客记录接口调用失败: ${error?.message || String(error || 'unknown')}`, 'interact_records')
      throw new Error('访客记录接口调用失败，请确认服务名和方法名是否与当前版本一致')
    }
  }

  private getInteractActionLabel(actionType: number): string {
    if (actionType === 1)
      return '偷取作物'
    if (actionType === 2)
      return '帮忙'
    if (actionType === 3)
      return '捣乱'
    return '互动'
  }

  private buildInteractActionDetail(record: {
    actionType: number
    cropName?: string
    cropCount?: number
    times?: number
    landId?: number
  }): string {
    const count = Number(record.cropCount) || 0
    const times = Number(record.times) || 0
    const landId = Number(record.landId) || 0
    const parts: string[] = []

    if (record.actionType === 1) {
      if (record.cropName && count > 0)
        parts.push(`偷取 ${record.cropName} × ${count}`)
      else if (record.cropName)
        parts.push(`偷取 ${record.cropName}`)
      else if (count > 0)
        parts.push(`偷取作物 × ${count}`)
      else
        parts.push('偷取作物')
    } else if (record.actionType === 2) {
      parts.push(times > 1 ? `帮忙 ${times} 次` : '帮忙')
    } else if (record.actionType === 3) {
      parts.push(times > 1 ? `捣乱 ${times} 次` : '捣乱')
    } else {
      parts.push(times > 1 ? `互动 ${times} 次` : '互动')
    }

    if (landId > 0)
      parts.push(`地块 ${landId}`)
    return parts.join(' · ')
  }

  private resolveInteractCropName(cropId: number): string {
    const id = Number(cropId) || 0
    if (id <= 0)
      return ''
    if (this.gameConfig.getPlantById(id))
      return this.gameConfig.getPlantName(id)
    if (this.gameConfig.getPlantByFruitId(id))
      return this.gameConfig.getFruitName(id)
    return ''
  }

  private normalizeInteractRecord(record: any, index: number): FriendInteractRecord {
    const actionType = toNum(record && record.action_type)
    const visitorGid = toNum(record && record.visitor_gid)
    const cropId = toNum(record && record.crop_id)
    const cropCount = toNum(record && record.crop_count)
    const times = toNum(record && record.times)
    const level = toNum(record && record.level)
    const fromType = toNum(record && record.from_type)
    const serverTimeSec = toTimeSec(record && record.server_time)
    const extra = (record && record.extra) || {}
    const landId = toNum(extra.land_id)
    const flag1 = toNum(extra.flag1)
    const flag2 = toNum(extra.flag2)
    const cropName = this.resolveInteractCropName(cropId)
    const nick = String((record && record.nick) || '').trim() || `GID:${visitorGid}`
    const avatarUrl = String((record && record.avatar_url) || '').trim()

    const normalized: FriendInteractRecord = {
      key: `${serverTimeSec || 0}-${visitorGid || 0}-${actionType || 0}-${index}`,
      serverTimeSec,
      serverTimeMs: serverTimeSec > 0 ? serverTimeSec * 1000 : 0,
      actionType,
      actionLabel: this.getInteractActionLabel(actionType),
      actionDetail: '',
      visitorGid,
      nick,
      avatarUrl,
      cropId,
      cropName,
      cropCount,
      times,
      fromType,
      level,
      landId,
      flag1,
      flag2
    }

    normalized.actionDetail = this.buildInteractActionDetail(normalized)
    return normalized
  }
}
