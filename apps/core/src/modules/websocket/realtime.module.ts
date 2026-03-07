import { Module } from '@nestjs/common'
import { AccountModule } from '../account/account.module'
import { AuthModule } from '../auth/auth.module'
import { WsServerService } from './ws-server.service'

@Module({
  imports: [AuthModule, AccountModule],
  providers: [WsServerService]
})
export class RealtimeModule {}
