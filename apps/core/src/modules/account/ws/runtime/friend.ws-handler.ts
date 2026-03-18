import { Injectable } from '@nestjs/common'
import { WsAccount } from '@/infrastructure/ws/decorators/ws-account.decorator'
import { WsBody } from '@/infrastructure/ws/decorators/ws-body.decorator'
import { WsRoute } from '@/infrastructure/ws/decorators/ws-route.decorator'
import { requireNumber, requireString } from '@/infrastructure/ws/ws-guards'
import { AccountLifecycleService } from '@/modules/account/application/account-lifecycle.service'
import { AccountRegistryService } from '@/modules/account/application/account-registry.service'
import { AccountStatusService } from '@/modules/account/application/account-status.service'
import { AccountConfigService } from '@/modules/account/persistence/account-config.service'

@Injectable()
export class FriendHandler {
  constructor(
    private readonly lifecycle: AccountLifecycleService,
    private readonly registry: AccountRegistryService,
    private readonly status: AccountStatusService,
    private readonly accountConfig: AccountConfigService
  ) {}

  @WsRoute('friends.lands')
  async lands(
    @WsAccount() accountId: string,
    @WsBody() data: Record<string, unknown>
  ): Promise<unknown> {
    const gid = Number(data?.gid ?? data?.friendId)
    if (!gid)
      throw new Error('缺少好友编号')
    return this.registry.getRunnerOrThrow(accountId).getFriendLands(gid)
  }

  @WsRoute('friends.execute')
  operate(
    @WsAccount() accountId: string,
    @WsBody() data: Record<string, unknown>
  ): Promise<unknown> {
    const gid = requireNumber(data, 'gid', '缺少好友编号或操作类型')
    const opType = requireString(data, 'opType', '缺少好友编号或操作类型')
    return this.registry.getRunnerOrThrow(accountId).doFriendOp(gid, opType)
  }

  @WsRoute('friends.toggleBlacklist')
  blacklistToggle(
    @WsAccount() accountId: string,
    @WsBody() data: Record<string, unknown>
  ): unknown {
    const gid = requireNumber(data, 'gid', '缺少好友编号')
    const current = this.accountConfig.getFriendBlacklist(accountId)
    const next = current.includes(gid) ? current.filter(item => item !== gid) : [...current, gid]
    const saved = this.accountConfig.setFriendBlacklist(accountId, next)
    this.lifecycle.applyConfig(accountId)
    this.status.notifyStrategyUpdate(accountId)
    return saved
  }

  @WsRoute('friends.interactRecords')
  interactRecords(@WsAccount() accountId: string): Promise<unknown> {
    return this.registry.getRunnerOrThrow(accountId).getInteractRecords()
  }
}
