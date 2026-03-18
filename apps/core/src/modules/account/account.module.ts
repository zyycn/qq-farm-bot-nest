import { Module } from '@nestjs/common'
import { WsModule } from '@/infrastructure/ws/ws.module'
import { DeviceModule } from '../device/device.module'
import { GameModule } from '../game/game.module'
import { SettingsModule } from '../settings/settings.module'
import { AccountDataModule } from './account-data.module'
import { AccountLifecycleService } from './application/account-lifecycle.service'
import { AccountRegistryService } from './application/account-registry.service'
import { AccountStatusService } from './application/account-status.service'
import { AccountService } from './application/account.service'
import { AccountRunnerFactory } from './application/runner/account-runner.factory'
import { AccountController } from './controllers/account.controller'
import { AccountWsRegistrar } from './ws/account-ws.registrar'
import { AccountHandler } from './ws/account/account.ws-handler'
import { FarmHandler } from './ws/runtime/farm.ws-handler'
import { FriendHandler } from './ws/runtime/friend.ws-handler'
import { ShopHandler } from './ws/runtime/shop.ws-handler'
import { WarehouseHandler } from './ws/runtime/warehouse.ws-handler'
import { AlmanacHandler } from './ws/state/almanac.ws-handler'
import { AnalyticsHandler } from './ws/state/analytics.ws-handler'
import { LogsHandler } from './ws/state/logs.ws-handler'
import { StrategyHandler } from './ws/state/strategy.ws-handler'
import { AccountTopicsService } from './ws/subscriptions/account-topics.service'
import { TopicsHandler } from './ws/subscriptions/topics.ws-handler'

@Module({
  imports: [AccountDataModule, SettingsModule, DeviceModule, GameModule, WsModule],
  controllers: [AccountController],
  providers: [
    AccountRegistryService,
    AccountRunnerFactory,
    AccountLifecycleService,
    AccountStatusService,
    AccountService,
    AccountWsRegistrar,
    AccountHandler,
    AlmanacHandler,
    AnalyticsHandler,
    FarmHandler,
    FriendHandler,
    LogsHandler,
    ShopHandler,
    StrategyHandler,
    WarehouseHandler,
    AccountTopicsService,
    TopicsHandler
  ],
  exports: [AccountRegistryService, AccountRunnerFactory, AccountLifecycleService, AccountStatusService, AccountService]
})
export class AccountModule {}
