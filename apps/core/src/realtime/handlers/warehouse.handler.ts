import { Injectable } from '@nestjs/common'
import { AccountRegistryService } from '@/account/account-registry.service'
import { InteractiveAction } from '../decorators/request-intent.decorator'
import { WsAccount } from '../decorators/ws-account.decorator'
import { WsBody } from '../decorators/ws-body.decorator'
import { WsRoute } from '../decorators/ws-route.decorator'

@Injectable()
export class WarehouseHandler {
  constructor(private readonly registry: AccountRegistryService) {}

  @InteractiveAction()
  @WsRoute('warehouse.sell')
  sell(
    @WsAccount() accountId: string,
    @WsBody() data: Record<string, unknown>
  ): Promise<unknown> {
    const itemId = Number(data?.itemId ?? data?.id)
    const count = Number(data?.count ?? 1)
    if (!itemId || count < 1)
      throw new Error('缺少物品编号或数量')
    return this.registry.getRunnerOrThrow(accountId).sellItem(itemId, count)
  }
}
