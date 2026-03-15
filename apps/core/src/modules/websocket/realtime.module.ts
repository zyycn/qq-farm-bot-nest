import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { AccountModule } from '@/modules/account/account.module'
import { AuthModule } from '@/modules/auth/auth.module'
import { StoreModule } from '@/store/store.module'
import { AccountHandler } from './handlers/account.handler'
import { AlmanacHandler } from './handlers/almanac.handler'
import { AnalyticsHandler } from './handlers/analytics.handler'
import { FarmHandler } from './handlers/farm.handler'
import { FriendHandler } from './handlers/friend.handler'
import { LogsHandler } from './handlers/logs.handler'
import { PanelHandler } from './handlers/panel.handler'
import { ShopHandler } from './handlers/shop.handler'
import { StrategyHandler } from './handlers/strategy.handler'
import { TopicsHandler } from './handlers/topics.handler'
import { WarehouseHandler } from './handlers/warehouse.handler'
import { RealtimePushService } from './realtime-push.service'
import { RealtimeGateway } from './realtime.gateway'
import { WsRouterService } from './ws-router.service'
import { WsTopicsService } from './ws-topics.service'

@Module({
  imports: [AuthModule, AccountModule, DiscoveryModule, StoreModule],
  providers: [
    WsRouterService,
    WsTopicsService,
    RealtimePushService,
    RealtimeGateway,
    AccountHandler,
    AlmanacHandler,
    AnalyticsHandler,
    FarmHandler,
    FriendHandler,
    LogsHandler,
    PanelHandler,
    ShopHandler,
    StrategyHandler,
    TopicsHandler,
    WarehouseHandler
  ],
  exports: [RealtimePushService]
})
export class RealtimeModule {}
