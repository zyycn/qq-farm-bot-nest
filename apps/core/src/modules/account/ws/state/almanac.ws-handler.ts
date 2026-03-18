import { Injectable } from '@nestjs/common'
import { WsAccount } from '@/infrastructure/ws/decorators/ws-account.decorator'
import { WsBody } from '@/infrastructure/ws/decorators/ws-body.decorator'
import { WsRoute } from '@/infrastructure/ws/decorators/ws-route.decorator'
import { AccountStatusService } from '@/modules/account/application/account-status.service'

@Injectable()
export class AlmanacHandler {
  constructor(private readonly status: AccountStatusService) {}

  @WsRoute('almanac.query')
  query(
    @WsAccount() accountId: string,
    @WsBody() data: Record<string, unknown>
  ): Promise<unknown> {
    return this.status.getAlmanac(accountId, { refresh: !!data?.refresh })
  }

  @WsRoute('almanac.claimRewards')
  claimRewards(@WsAccount() accountId: string): Promise<unknown> {
    return this.status.claimAlmanacRewards(accountId)
  }
}
