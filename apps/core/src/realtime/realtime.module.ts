import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { AccountModule } from '../account/account.module'
import { AuthModule } from '../auth/auth.module'
import { RequestIntentContextService } from '../common/request-intent/request-intent-context.service'
import { DeviceModule } from '../device/device.module'
import { GameModule } from '../game/game.module'
import { StoreModule } from '../store/store.module'
import { AccountPushBridge } from './account-push.bridge'
import { AccountHandler } from './handlers/account.handler'
import { AlmanacHandler } from './handlers/almanac.handler'
import { AnalyticsHandler } from './handlers/analytics.handler'
import { DeviceHandler } from './handlers/device.handler'
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
  imports: [AuthModule, DeviceModule, DiscoveryModule, StoreModule, AccountModule, GameModule],
  providers: [
    AccountPushBridge,
    RequestIntentContextService,
    WsRouterService,
    WsTopicsService,
    RealtimePushService,
    RealtimeGateway,
    AccountHandler,
    AlmanacHandler,
    AnalyticsHandler,
    DeviceHandler,
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
