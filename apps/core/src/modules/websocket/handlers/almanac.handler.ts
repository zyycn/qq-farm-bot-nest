import { Injectable } from '@nestjs/common'
import { AccountManagerService } from '@/game/account-manager.service'
import { WsAccount } from '../decorators/ws-account.decorator'
import { WsBody } from '../decorators/ws-body.decorator'
import { WsRoute } from '../decorators/ws-route.decorator'

@Injectable()
export class AlmanacHandler {
  constructor(
    private readonly manager: AccountManagerService
  ) {}

  @WsRoute('almanac.query')
  query(
    @WsAccount() accountId: string,
    @WsBody() data: Record<string, unknown>
  ): Promise<unknown> {
    return this.manager.getAlmanac(accountId, {
      refresh: !!data?.refresh
    })
  }

  @WsRoute('almanac.claimRewards')
  claimRewards(
    @WsAccount() accountId: string
  ): Promise<unknown> {
    return this.manager.claimAlmanacRewards(accountId)
  }
}
