import { Global, Module } from '@nestjs/common'
import { LinkClientService } from './link-client.service'

@Global()
@Module({
  providers: [LinkClientService],
  exports: [LinkClientService]
})
export class TransportModule {}
