import { Global, Module } from '@nestjs/common'
import { ProtoService } from './proto.service'
import { GameConfigService } from './game-config.service'
import { GameClientFactory } from './game-client.factory'
import { GameLogService } from './game-log.service'
import { GamePushService } from './game-push.service'
import { AccountManagerService } from './account-manager.service'
import { QRLoginService } from './services/qrlogin.worker'

@Global()
@Module({
  providers: [ProtoService, GameConfigService, GameClientFactory, GameLogService, GamePushService, AccountManagerService, QRLoginService],
  exports: [GameConfigService, AccountManagerService, QRLoginService],
})
export class GameModule {}
