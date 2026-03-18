import type { OnModuleInit } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import { WsRouterService } from '@/infrastructure/ws/ws-router.service'
import { PanelHandler } from './panel.ws-handler'

@Injectable()
export class SettingsWsRegistrar implements OnModuleInit {
  constructor(
    private readonly router: WsRouterService,
    private readonly panelHandler: PanelHandler
  ) {}

  onModuleInit(): void {
    this.router.registerHandlers([this.panelHandler])
  }
}
