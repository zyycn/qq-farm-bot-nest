import { Module } from '@nestjs/common'
import { SettingsModule } from '../settings/settings.module'
import { GameConfigService } from './application/game-config.service'
import { GameLogService } from './application/game-log.service'
import { GamePushService } from './application/game-push.service'
import { LinkClientService } from './application/link-client.service'
import { GameLogRepository } from './persistence/game-log.repository'

@Module({
  imports: [SettingsModule],
  providers: [LinkClientService, GameConfigService, GameLogRepository, GameLogService, GamePushService],
  exports: [LinkClientService, GameConfigService, GameLogService, GamePushService]
})
export class GameModule {}
