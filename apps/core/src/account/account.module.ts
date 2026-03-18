import { Module } from '@nestjs/common'
import { DeviceModule } from '../device/device.module'
import { GameModule } from '../game/game.module'
import { StoreModule } from '../store/store.module'
import { AccountLifecycleService } from './account-lifecycle.service'
import { AccountRegistryService } from './account-registry.service'
import { AccountStatusService } from './account-status.service'
import { AccountController } from './account.controller'
import { AccountService } from './account.service'
import { AccountRunnerFactory } from './runner/account-runner.factory'

@Module({
  imports: [DeviceModule, GameModule, StoreModule],
  controllers: [AccountController],
  providers: [AccountRegistryService, AccountRunnerFactory, AccountLifecycleService, AccountStatusService, AccountService],
  exports: [AccountRegistryService, AccountRunnerFactory, AccountLifecycleService, AccountStatusService, AccountService]
})
export class AccountModule {}
