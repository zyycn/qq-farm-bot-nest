import type { OnModuleInit } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import { TopicsHandler } from './handlers/topics.handler'
import { WsRouterService } from './ws-router.service'

@Injectable()
export class WsHandlersRegistrar implements OnModuleInit {
  constructor(
    private readonly router: WsRouterService,
    private readonly topicsHandler: TopicsHandler
  ) {}

  onModuleInit(): void {
    this.router.registerHandlers([this.topicsHandler])
  }
}
