import { Injectable } from '@nestjs/common'
import { WsAccount } from '@/infrastructure/ws/decorators/ws-account.decorator'
import { WsBody } from '@/infrastructure/ws/decorators/ws-body.decorator'
import { WsRoute } from '@/infrastructure/ws/decorators/ws-route.decorator'
import { AccountRegistryService } from '@/modules/account/application/account-registry.service'

@Injectable()
export class FarmHandler {
  constructor(private readonly registry: AccountRegistryService) {}

  @WsRoute('seeds.query')
  querySeeds(@WsAccount() accountId: string): unknown {
    return this.registry.getRunnerOrThrow(accountId).getSeeds()
  }

  @WsRoute('bagSeeds.query')
  queryBagSeeds(@WsAccount() accountId: string): unknown {
    return this.registry.getRunnerOrThrow(accountId).getBagSeeds()
  }

  @WsRoute('farm.execute')
  operate(
    @WsAccount() accountId: string,
    @WsBody() data: Record<string, unknown>
  ): Promise<unknown> {
    return this.registry.getRunnerOrThrow(accountId).doFarmOp(String(data?.opType ?? ''))
  }

  @WsRoute('farm.singleLandOp')
  singleLandOp(
    @WsAccount() accountId: string,
    @WsBody() data: Record<string, unknown>
  ): Promise<unknown> {
    return this.registry.getRunnerOrThrow(accountId).doSingleLandOp({
      action: String(data?.action ?? '').trim().toLowerCase(),
      landId: Number(data?.landId) || 0,
      seedId: Number(data?.seedId) || 0
    })
  }
}
