import type { IGameTransport } from '../../interfaces/game-transport.interface'
import { resolveRequestSource } from '../../interfaces/request-context.interface'
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
      const { data } = await this.rpc.call<any>('friend.syncAll', { open_ids: [] }, {
        source: resolveRequestSource()
      })
      return data ?? {}
    }
    const { data } = await this.rpc.call<any>('friend.getAll', {}, {
      source: resolveRequestSource()
    })
    return data ?? {}
  }

  async getApplications(): Promise<any> {
    const { data } = await this.rpc.call<any>('friend.getApplications', {}, {
      source: resolveRequestSource()
    })
    return data ?? {}
  }

  async acceptFriends(gids: number[]): Promise<any> {
    const { data } = await this.rpc.call<any>('friend.acceptFriends', { friend_gids: gids }, {
      source: resolveRequestSource()
    })
    return data ?? {}
  }

  async enterFriendFarm(friendGid: number): Promise<any> {
    const { data } = await this.rpc.call<any>('friend.enter', { host_gid: friendGid, reason: 2 }, {
      source: resolveRequestSource()
    })
    return data ?? {}
  }

  async leaveFriendFarm(friendGid: number) {
    try {
      await this.rpc.call('friend.leave', { host_gid: friendGid }, {
        source: resolveRequestSource()
      })
    } catch {}
  }

  async checkCanOperateRemote(friendGid: number, operationId: number) {
    try {
      const { data: reply } = await this.rpc.call<any>('friend.checkCanOperate', {
        host_gid: friendGid,
        operation_id: operationId
      }, {
        source: resolveRequestSource()
      })
      return { canOperate: !!(reply as any)?.can_operate, canStealNum: toNum((reply as any)?.can_steal_num) }
    } catch {
      return { canOperate: true, canStealNum: 0 }
    }
  }
}
