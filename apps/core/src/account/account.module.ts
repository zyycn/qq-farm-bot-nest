import { Global, Module } from '@nestjs/common'
import { DeviceModule } from '../device/device.module'
import { AccountLifecycleService } from './account-lifecycle.service'
import { AccountRegistryService } from './account-registry.service'
import { AccountStatusService } from './account-status.service'
import { AccountController } from './account.controller'
import { AccountService } from './account.service'
import { AccountRunnerFactory } from './runner/account-runner.factory'

@Global()
@Module({
  imports: [DeviceModule],
  controllers: [AccountController],
  providers: [AccountRegistryService, AccountRunnerFactory, AccountLifecycleService, AccountStatusService, AccountService],
  exports: [AccountRegistryService, AccountRunnerFactory, AccountLifecycleService, AccountStatusService, AccountService]
})
export class AccountModule {}
