import { Injectable } from '@nestjs/common'
import { WsAccount } from '@/infrastructure/ws/decorators/ws-account.decorator'
import { WsBody } from '@/infrastructure/ws/decorators/ws-body.decorator'
import { WsRoute } from '@/infrastructure/ws/decorators/ws-route.decorator'
import { AccountStatusService } from '@/modules/account/application/account-status.service'

@Injectable()
export class AnalyticsHandler {
  constructor(private readonly status: AccountStatusService) {}

  @WsRoute('analytics.query')
  query(
    @WsAccount() _accountId: string,
    @WsBody() data: Record<string, unknown>
  ): unknown {
    const sortBy = String(data?.sortBy ?? data?.sort ?? '')
    return this.status.getAnalytics(sortBy)
  }
}
