import { Injectable } from '@nestjs/common'
import { AccountLifecycleService } from '@/account/account-lifecycle.service'
import { AccountRegistryService } from '@/account/account-registry.service'
import { AccountStatusService } from '@/account/account-status.service'
import { StoreService } from '@/store/store.service'
import { InteractiveAction } from '../decorators/request-intent.decorator'
import { WsAccount } from '../decorators/ws-account.decorator'
import { WsBody } from '../decorators/ws-body.decorator'
import { WsRoute } from '../decorators/ws-route.decorator'
import { requireNumber, requireString } from '../ws-guards'

@Injectable()
export class FriendHandler {
  constructor(
    private readonly lifecycle: AccountLifecycleService,
    private readonly registry: AccountRegistryService,
    private readonly status: AccountStatusService,
    private readonly store: StoreService
  ) {}

  @InteractiveAction()
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

  @InteractiveAction()
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
    const current = this.store.getFriendBlacklist(accountId)
    const next = current.includes(gid) ? current.filter(item => item !== gid) : [...current, gid]
    const saved = this.store.setFriendBlacklist(accountId, next)
    this.lifecycle.applyConfig(accountId)
    this.status.notifyStrategyUpdate(accountId)
    return saved
  }

  @InteractiveAction()
  @WsRoute('friends.interactRecords')
  interactRecords(@WsAccount() accountId: string): Promise<unknown> {
    return this.registry.getRunnerOrThrow(accountId).getInteractRecords()
  }
}
