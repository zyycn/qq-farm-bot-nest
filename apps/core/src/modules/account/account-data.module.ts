import { Module } from '@nestjs/common'
import { SettingsModule } from '../settings/settings.module'
import { AccountConfigService } from './persistence/account-config.service'
import { AccountRepository } from './persistence/account-repository'

@Module({
  imports: [SettingsModule],
  providers: [AccountConfigService, AccountRepository],
  exports: [AccountConfigService, AccountRepository]
})
export class AccountDataModule {}
