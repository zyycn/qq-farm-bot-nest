import { Module } from '@nestjs/common'
import { AccountConfigService } from './account-config.service'
import { AccountRepository } from './account-repository'
import { GlobalConfigService } from './global-config.service'

@Module({
  providers: [GlobalConfigService, AccountConfigService, AccountRepository],
  exports: [GlobalConfigService, AccountConfigService, AccountRepository]
})
export class StoreModule {}
