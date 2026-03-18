import { Injectable } from '@nestjs/common'
import { WsAccount } from '@/infrastructure/ws/decorators/ws-account.decorator'
import { WsBody } from '@/infrastructure/ws/decorators/ws-body.decorator'
import { WsRoute } from '@/infrastructure/ws/decorators/ws-route.decorator'
import { AccountStatusService } from '@/modules/account/application/account-status.service'

@Injectable()
export class LogsHandler {
  constructor(private readonly status: AccountStatusService) {}

  @WsRoute('logs.query')
  query(
    @WsAccount() accountId: string,
    @WsBody() data: Record<string, unknown>
  ): unknown {
    return this.status.getLogs(accountId, {
      module: data?.module as string | undefined,
      event: data?.event as string | undefined,
      keyword: data?.keyword as string | undefined,
      isWarn: data?.isWarn === 'warn' ? true : data?.isWarn === 'info' ? false : undefined,
      limit: Number(data?.limit) || 50
    })
  }
}
