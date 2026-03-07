import { Module } from '@nestjs/common'
import { AccountModule } from '../account/account.module'
import { AuthModule } from '../auth/auth.module'
import { RealtimeGateway } from './realtime.gateway'

@Module({
  imports: [AuthModule, AccountModule],
  providers: [RealtimeGateway]
})
export class RealtimeModule {}
