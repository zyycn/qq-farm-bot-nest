import { Injectable } from '@nestjs/common'
import { AccountStatusService } from '@/account/account-status.service'
import { WsAccount } from '../decorators/ws-account.decorator'
import { WsBody } from '../decorators/ws-body.decorator'
import { WsRoute } from '../decorators/ws-route.decorator'

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
