import type { GameConfigService } from '../../game-config.service'
import type { IGameTransport } from '../../interfaces/game-transport.interface'
import { toNum, toTimeSec } from '../../utils'

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
  private readonly interactRpcCandidates: Array<[string, string]> = [
    ['gamepb.interactpb.InteractService', 'InteractRecords'],
    ['gamepb.interactpb.InteractService', 'GetInteractRecords'],
    ['gamepb.interactpb.VisitorService', 'InteractRecords'],
    ['gamepb.interactpb.VisitorService', 'GetInteractRecords']
  ]

  constructor(
    private readonly client: IGameTransport,
    private readonly gameConfig: GameConfigService,
    private readonly warn: (msg: string, event?: string) => void
  ) {}

  async getInteractRecords(): Promise<FriendInteractRecord[]> {
    const errors: string[] = []
    for (const [serviceName, methodName] of this.interactRpcCandidates) {
      try {
        const { data: reply } = await this.client.invoke<any>(serviceName, methodName, {}, 2500)
        const records = Array.isArray(reply?.records) ? reply.records : []
        return records
          .map((record, index) => this.normalizeInteractRecord(record, index))
          .sort((a, b) => (b.serverTimeSec - a.serverTimeSec) || (b.visitorGid - a.visitorGid) || (b.actionType - a.actionType))
      } catch (error: any) {
        const msg = error?.message || String(error || 'unknown')
        errors.push(`${serviceName}.${methodName}: ${msg}`)
      }
    }

    this.warn(`访客记录接口调用失败: ${errors.join(' | ')}`, 'interact_records')
    throw new Error('访客记录接口调用失败，请确认服务名和方法名是否与当前版本一致')
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
