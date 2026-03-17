import { Module } from '@nestjs/common'
import { ConnectionManagerService } from './connection/connection-manager.service'
import { GameInvokeService } from './game-invoke.service'
import { ProtoLoaderService } from './proto/proto-loader.service'
import { TcpServerService } from './tcp/tcp-server.service'

@Module({
  providers: [
    ProtoLoaderService,
    GameInvokeService,
    ConnectionManagerService,
    TcpServerService
  ]
})
export class LinkModule {}
