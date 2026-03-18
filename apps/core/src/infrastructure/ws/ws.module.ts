import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { AccountPushBridge } from './account-push.bridge'
import { WsPushService } from './ws-push.service'
import { WsRouterService } from './ws-router.service'
import { WsGateway } from './ws.gateway'

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('app.jwtSecret', 'qq-farm-bot-jwt-secret-change-me'),
        signOptions: { expiresIn: config.get<string>('app.jwtExpiresIn', '7d') as any }
      })
    })
  ],
  providers: [
    AccountPushBridge,
    WsRouterService,
    WsPushService,
    WsGateway
  ],
  exports: [WsPushService, WsRouterService]
})
export class WsModule {}
