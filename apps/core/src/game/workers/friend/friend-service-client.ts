import type { IGameTransport } from '../../interfaces/game-transport.interface'
import { toNum } from '../../utils'

export class FriendServiceClient {
  constructor(
    private readonly client: IGameTransport,
    private readonly platform: string
  ) {}

  async getAllFriends(): Promise<any> {
    if (this.platform === 'qq') {
      const { data } = await this.client.invoke('gamepb.friendpb.FriendService', 'SyncAll', { open_ids: [] })
      return data ?? {}
    }
    const { data } = await this.client.invoke('gamepb.friendpb.FriendService', 'GetAll', {})
    return data ?? {}
  }

  async getApplications(): Promise<any> {
    const { data } = await this.client.invoke('gamepb.friendpb.FriendService', 'GetApplications', {})
    return data ?? {}
  }

  async acceptFriends(gids: number[]): Promise<any> {
    const { data } = await this.client.invoke('gamepb.friendpb.FriendService', 'AcceptFriends', { friend_gids: gids })
    return data ?? {}
  }

  async enterFriendFarm(friendGid: number): Promise<any> {
    const { data } = await this.client.invoke('gamepb.visitpb.VisitService', 'Enter', { host_gid: friendGid, reason: 2 })
    return data ?? {}
  }

  async leaveFriendFarm(friendGid: number) {
    try {
      await this.client.invoke('gamepb.visitpb.VisitService', 'Leave', { host_gid: friendGid })
    } catch {}
  }

  async checkCanOperateRemote(friendGid: number, operationId: number) {
    try {
      const { data: reply } = await this.client.invoke<any>('gamepb.plantpb.PlantService', 'CheckCanOperate', { host_gid: friendGid, operation_id: operationId })
      return { canOperate: !!(reply as any)?.can_operate, canStealNum: toNum((reply as any)?.can_steal_num) }
    } catch {
      return { canOperate: true, canStealNum: 0 }
    }
  }
}
