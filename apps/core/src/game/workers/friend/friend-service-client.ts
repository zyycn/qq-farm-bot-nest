import type { IGameTransport } from '../../interfaces/game-transport.interface'
import type { GameRequestContext } from '../../interfaces/request-context.interface'
import { resolveRequestSource } from '../../interfaces/request-context.interface'
import { toNum } from '../../utils'

export class FriendServiceClient {
  constructor(
    private readonly client: IGameTransport,
    private readonly platform: string
  ) {}

  private invokeFriendRead<T = unknown>(service: string, method: string, params: Record<string, unknown>, requestContext?: GameRequestContext) {
    return this.client.invokeWithPolicy<T>({
      service,
      method,
      params,
      policy: {
        category: 'friend_visit',
        risk: 'low',
        source: resolveRequestSource(requestContext)
      }
    })
  }

  private invokeFriendWrite<T = unknown>(service: string, method: string, params: Record<string, unknown>, requestContext?: GameRequestContext) {
    return this.client.invokeWithPolicy<T>({
      service,
      method,
      params,
      policy: {
        category: 'friend_write',
        risk: 'high',
        source: resolveRequestSource(requestContext)
      }
    })
  }

  private invokeFriendVisit<T = unknown>(service: string, method: string, params: Record<string, unknown>, requestContext?: GameRequestContext) {
    return this.client.invokeWithPolicy<T>({
      service,
      method,
      params,
      policy: {
        category: 'friend_visit',
        risk: 'high',
        source: resolveRequestSource(requestContext)
      }
    })
  }

  async getAllFriends(requestContext?: GameRequestContext): Promise<any> {
    if (this.platform === 'qq') {
      const { data } = await this.invokeFriendRead('gamepb.friendpb.FriendService', 'SyncAll', { open_ids: [] }, requestContext)
      return data ?? {}
    }
    const { data } = await this.invokeFriendRead('gamepb.friendpb.FriendService', 'GetAll', {}, requestContext)
    return data ?? {}
  }

  async getApplications(requestContext?: GameRequestContext): Promise<any> {
    const { data } = await this.invokeFriendRead('gamepb.friendpb.FriendService', 'GetApplications', {}, requestContext)
    return data ?? {}
  }

  async acceptFriends(gids: number[], requestContext?: GameRequestContext): Promise<any> {
    const { data } = await this.invokeFriendWrite('gamepb.friendpb.FriendService', 'AcceptFriends', { friend_gids: gids }, requestContext)
    return data ?? {}
  }

  async enterFriendFarm(friendGid: number, requestContext?: GameRequestContext): Promise<any> {
    const { data } = await this.invokeFriendVisit('gamepb.visitpb.VisitService', 'Enter', { host_gid: friendGid, reason: 2 }, requestContext)
    return data ?? {}
  }

  async leaveFriendFarm(friendGid: number, requestContext?: GameRequestContext) {
    try {
      await this.invokeFriendVisit('gamepb.visitpb.VisitService', 'Leave', { host_gid: friendGid }, requestContext)
    } catch {}
  }

  async checkCanOperateRemote(friendGid: number, operationId: number, requestContext?: GameRequestContext) {
    try {
      const { data: reply } = await this.invokeFriendRead<any>('gamepb.plantpb.PlantService', 'CheckCanOperate', { host_gid: friendGid, operation_id: operationId }, requestContext)
      return { canOperate: !!(reply as any)?.can_operate, canStealNum: toNum((reply as any)?.can_steal_num) }
    } catch {
      return { canOperate: true, canStealNum: 0 }
    }
  }
}
