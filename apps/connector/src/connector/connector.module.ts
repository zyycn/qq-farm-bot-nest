import { Module } from '@nestjs/common'
import { ConnectionManagerService } from './connection-manager.service'
import { ProtoLoaderService } from './proto-loader.service'
import { TcpServerService } from './tcp-server.service'

@Module({
  providers: [
    ProtoLoaderService,
    ConnectionManagerService,
    TcpServerService
  ]
})
export class ConnectorModule {}
