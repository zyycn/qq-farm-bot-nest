import { Injectable } from '@nestjs/common'
import { ProtoService } from './proto.service'
import { GameClient } from './game-client'

@Injectable()
export class GameClientFactory {
  constructor(private readonly proto: ProtoService) {}

  create(accountId: string): GameClient {
    return new GameClient(accountId, this.proto)
  }
}
