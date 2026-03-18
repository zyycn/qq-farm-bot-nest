import { Module } from '@nestjs/common'
import { StoreModule } from '../store/store.module'
import { GameConfigService } from './game-config.service'
import { GameLogService } from './game-log.service'
import { GamePushService } from './game-push.service'
import { QRLoginService } from './workers/qrlogin.worker'

@Module({
  imports: [StoreModule],
  providers: [GameConfigService, GameLogService, GamePushService, QRLoginService],
  exports: [GameConfigService, GameLogService, GamePushService, QRLoginService]
})
export class GameModule {}
