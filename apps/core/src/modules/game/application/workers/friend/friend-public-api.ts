import type { FriendLandAnalysis } from './friend-land-analysis'
import type { GameConfigService } from '@/modules/game/application/game-config.service'
import { toNum } from '@/modules/game/domain/utils'
import { buildFriendLandDetail } from './friend-land-detail'
import { normalizeFriendSummary, shouldKeepFriend, sortFriendSummaries } from './friend-list'

export interface FriendPublicApiDeps {
  gameConfig: GameConfigService
  getMyGid: () => number
  getAllFriends: () => Promise<any>
  enterFriendFarm: (gid: number) => Promise<any>
  leaveFriendFarm: (gid: number) => Promise<void>
  checkCanOperateRemote: (gid: number, operationId: number) => Promise<{ canOperate: boolean, canStealNum: number }>
  analyzeFriendLands: (lands: any[], myGid: number) => FriendLandAnalysis
  getFriendOpHandlers: () => Record<string, (status: FriendLandAnalysis, gid: number) => Promise<{ ok: boolean, opType: string, count?: number, message: string, bugCount?: number, weedCount?: number }>>
}

export class FriendPublicApi {
  constructor(private readonly deps: FriendPublicApiDeps) {}

  async getFriendsList() {
    try {
      const reply = await this.deps.getAllFriends()
      const friends = reply.game_friends || []
      const myGid = this.deps.getMyGid()
      return sortFriendSummaries(
        friends
          .filter((friend: any) => shouldKeepFriend(friend, myGid))
          .map((friend: any) => normalizeFriendSummary(friend))
      )
    } catch {
      return []
    }
  }

  async getFriendLandsDetail(friendGid: number) {
    try {
      const enterReply = await this.deps.enterFriendFarm(friendGid)
      const lands = enterReply.lands || []
      const analyzed = this.deps.analyzeFriendLands(lands, this.deps.getMyGid())
      await this.deps.leaveFriendFarm(friendGid)

      if (analyzed.stealable.length > 0) {
        const pre = await this.deps.checkCanOperateRemote(friendGid, 10008)
        if (!pre.canOperate) {
          analyzed.stealable = []
          analyzed.stealableInfo = []
        }
      }
      return buildFriendLandDetail(lands, analyzed, this.deps.gameConfig)
    } catch {
      return { lands: [], summary: {} }
    }
  }

  async doFriendOperation(friendGid: number, opType: string) {
    const gid = toNum(friendGid)
    if (!gid)
      return { ok: false, message: '无效好友ID', opType }

    let enterReply: any
    try {
      enterReply = await this.deps.enterFriendFarm(gid)
    } catch (e: any) {
      return { ok: false, message: `进入好友农场失败: ${e?.message}`, opType }
    }

    try {
      const lands = enterReply.lands || []
      const status = this.deps.analyzeFriendLands(lands, this.deps.getMyGid())
      const handler = this.deps.getFriendOpHandlers()[opType]
      if (!handler)
        return { ok: false, opType, count: 0, message: '未知操作类型' }
      return await handler(status, gid)
    } catch (e: any) {
      return { ok: false, opType, count: 0, message: e?.message || '操作失败' }
    } finally {
      try {
        await this.deps.leaveFriendFarm(gid)
      } catch {}
    }
  }
}
