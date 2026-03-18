import { Module } from '@nestjs/common'
import { AuthModule } from '../../modules/auth/auth.module'
import { AccountPushBridge } from './account-push.bridge'
import { TopicsHandler } from './handlers/topics.handler'
import { WsHandlersRegistrar } from './ws-handlers.registrar'
import { WsPushService } from './ws-push.service'
import { WsRouterService } from './ws-router.service'
import { WsTopicsService } from './ws-topics.service'
import { WsGateway } from './ws.gateway'

@Module({
  imports: [AuthModule],
  providers: [
    AccountPushBridge,
    WsRouterService,
    WsHandlersRegistrar,
    WsTopicsService,
    WsPushService,
    WsGateway,
    TopicsHandler
  ],
  exports: [WsPushService, WsRouterService]
})
export class WsModule {}
