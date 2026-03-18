import type { IGameTransport } from '../../interfaces/game-transport.interface'
import { GameRpcExecutor } from '../../rpc/game-rpc-executor'
import { toNum } from '../../utils'

export class FriendServiceClient {
  private readonly rpc: GameRpcExecutor

  constructor(
    private readonly client: IGameTransport,
    private readonly platform: string
  ) {
    this.rpc = new GameRpcExecutor(this.client)
  }

  async getAllFriends(): Promise<any> {
    if (this.platform === 'qq') {
      const { data } = await this.rpc.call<any>('friend.syncAll', { open_ids: [] })
      return data ?? {}
    }
    const { data } = await this.rpc.call<any>('friend.getAll', {})
    return data ?? {}
  }

  async getApplications(): Promise<any> {
    const { data } = await this.rpc.call<any>('friend.getApplications', {})
    return data ?? {}
  }

  async acceptFriends(gids: number[]): Promise<any> {
    const { data } = await this.rpc.call<any>('friend.acceptFriends', { friend_gids: gids })
    return data ?? {}
  }

  async enterFriendFarm(friendGid: number): Promise<any> {
    const { data } = await this.rpc.call<any>('friend.enter', { host_gid: friendGid, reason: 2 })
    return data ?? {}
  }

  async leaveFriendFarm(friendGid: number) {
    try {
      await this.rpc.call('friend.leave', { host_gid: friendGid })
    } catch {}
  }

  async checkCanOperateRemote(friendGid: number, operationId: number) {
    try {
      const { data: reply } = await this.rpc.call<any>('friend.checkCanOperate', {
        host_gid: friendGid,
        operation_id: operationId
      })
      return { canOperate: !!(reply as any)?.can_operate, canStealNum: toNum((reply as any)?.can_steal_num) }
    } catch {
      return { canOperate: true, canStealNum: 0 }
    }
  }
}
