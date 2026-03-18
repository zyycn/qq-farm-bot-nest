import type { OnModuleInit } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import { WsRouterService } from '@/infrastructure/ws/ws-router.service'
import { AccountHandler } from './account/account.ws-handler'
import { FarmHandler } from './runtime/farm.ws-handler'
import { FriendHandler } from './runtime/friend.ws-handler'
import { ShopHandler } from './runtime/shop.ws-handler'
import { WarehouseHandler } from './runtime/warehouse.ws-handler'
import { AlmanacHandler } from './state/almanac.ws-handler'
import { AnalyticsHandler } from './state/analytics.ws-handler'
import { LogsHandler } from './state/logs.ws-handler'
import { StrategyHandler } from './state/strategy.ws-handler'

@Injectable()
export class AccountWsRegistrar implements OnModuleInit {
  constructor(
    private readonly router: WsRouterService,
    private readonly accountHandler: AccountHandler,
    private readonly almanacHandler: AlmanacHandler,
    private readonly analyticsHandler: AnalyticsHandler,
    private readonly farmHandler: FarmHandler,
    private readonly friendHandler: FriendHandler,
    private readonly logsHandler: LogsHandler,
    private readonly shopHandler: ShopHandler,
    private readonly strategyHandler: StrategyHandler,
    private readonly warehouseHandler: WarehouseHandler
  ) {}

  onModuleInit(): void {
    this.router.registerHandlers([
      this.accountHandler,
      this.almanacHandler,
      this.analyticsHandler,
      this.farmHandler,
      this.friendHandler,
      this.logsHandler,
      this.shopHandler,
      this.strategyHandler,
      this.warehouseHandler
    ])
  }
}
