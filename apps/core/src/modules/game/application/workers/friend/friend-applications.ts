import { toNum } from '@/modules/game/domain/utils'
import { getFriendDisplayName } from './friend-list'

export class FriendApplicationsHandler {
  constructor(
    private readonly getApplications: () => Promise<any>,
    private readonly acceptFriends: (gids: number[]) => Promise<any>,
    private readonly log: (msg: string, event?: string) => void,
    private readonly warn: (msg: string, event?: string) => void
  ) {}

  handleApplicationReceived(applications: any[]) {
    const names = applications.map((application: any) => application.name || `GID:${toNum(application.gid)}`).join(', ')
    this.log(`收到 ${applications.length} 个好友申请: ${names}`, 'friend_cycle')
    const gids = applications.map((application: any) => toNum(application.gid))
    void this.acceptFriendsWithRetry(gids)
  }

  async checkAndAcceptApplications() {
    try {
      const reply = await this.getApplications()
      const applications = reply.applications || []
      if (!applications.length)
        return
      const names = applications.map((application: any) => application.name || `GID:${toNum(application.gid)}`).join(', ')
      this.log(`发现 ${applications.length} 个待处理申请: ${names}`, 'friend_cycle')
      await this.acceptFriendsWithRetry(applications.map((application: any) => toNum(application.gid)))
    } catch {}
  }

  private async acceptFriendsWithRetry(gids: number[]) {
    if (!gids.length)
      return
    try {
      const reply = await this.acceptFriends(gids)
      const friends = reply.friends || []
      if (friends.length > 0) {
        const names = friends.map((friend: any) => getFriendDisplayName(friend)).join(', ')
        this.log(`已同意 ${friends.length} 人: ${names}`, 'friend_cycle')
      }
    } catch (error: any) {
      this.warn(`同意失败: ${error?.message}`, 'friend_cycle')
    }
  }
}
