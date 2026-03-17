import { Injectable } from '@nestjs/common'
import { AccountRegistryService } from '@/account/account-registry.service'
import { WsAccount } from '../decorators/ws-account.decorator'
import { WsBody } from '../decorators/ws-body.decorator'
import { WsRoute } from '../decorators/ws-route.decorator'

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
