import { Injectable } from '@nestjs/common'
import { WsAccount } from '@/infrastructure/ws/decorators/ws-account.decorator'
import { WsBody } from '@/infrastructure/ws/decorators/ws-body.decorator'
import { WsRoute } from '@/infrastructure/ws/decorators/ws-route.decorator'
import { AccountRegistryService } from '@/modules/account/application/account-registry.service'

@Injectable()
export class WarehouseHandler {
  constructor(private readonly registry: AccountRegistryService) {}

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
