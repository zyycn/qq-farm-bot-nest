import { Global, Module } from '@nestjs/common'
import { StoreModule } from '../store/store.module'
import { GameConfigService } from './game-config.service'
import { GameLogService } from './game-log.service'
import { GamePushService } from './game-push.service'
import { LinkClientService } from './link-client.service'
import { QRLoginService } from './workers/qrlogin.worker'

@Global()
@Module({
  imports: [StoreModule],
  providers: [LinkClientService, GameConfigService, GameLogService, GamePushService, QRLoginService],
  exports: [LinkClientService, GameConfigService, GameLogService, GamePushService, QRLoginService]
})
export class GameModule {}
