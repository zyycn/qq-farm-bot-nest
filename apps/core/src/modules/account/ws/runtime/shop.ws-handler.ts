import { Injectable } from '@nestjs/common'
import { WsAccount } from '@/infrastructure/ws/decorators/ws-account.decorator'
import { WsBody } from '@/infrastructure/ws/decorators/ws-body.decorator'
import { WsRoute } from '@/infrastructure/ws/decorators/ws-route.decorator'
import { AccountRegistryService } from '@/modules/account/application/account-registry.service'

@Injectable()
export class ShopHandler {
  constructor(private readonly registry: AccountRegistryService) {}

  @WsRoute('shop.buy')
  buy(
    @WsAccount() accountId: string,
    @WsBody() data: Record<string, unknown>
  ): Promise<unknown> {
    const goodsId = Number(data?.goodsId)
    const count = Number(data?.count ?? 1)
    const price = Number(data?.price)
    if (!goodsId || count < 1 || price == null || price < 0)
      throw new Error('缺少商品编号、数量或价格')
    return this.registry.getRunnerOrThrow(accountId).buySeed(goodsId, count, price)
  }
}
