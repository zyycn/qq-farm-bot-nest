import { Injectable } from '@nestjs/common'
import { AccountRegistryService } from '@/account/account-registry.service'
import { InteractiveAction } from '../decorators/request-intent.decorator'
import { WsAccount } from '../decorators/ws-account.decorator'
import { WsBody } from '../decorators/ws-body.decorator'
import { WsRoute } from '../decorators/ws-route.decorator'

@Injectable()
export class FarmHandler {
  constructor(private readonly registry: AccountRegistryService) {}

  @InteractiveAction()
  @WsRoute('seeds.query')
  querySeeds(@WsAccount() accountId: string): unknown {
    return this.registry.getRunnerOrThrow(accountId).getSeeds()
  }

  @InteractiveAction()
  @WsRoute('bagSeeds.query')
  queryBagSeeds(@WsAccount() accountId: string): unknown {
    return this.registry.getRunnerOrThrow(accountId).getBagSeeds()
  }

  @InteractiveAction()
  @WsRoute('farm.execute')
  operate(
    @WsAccount() accountId: string,
    @WsBody() data: Record<string, unknown>
  ): Promise<unknown> {
    return this.registry.getRunnerOrThrow(accountId).doFarmOp(String(data?.opType ?? ''))
  }

  @InteractiveAction()
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
