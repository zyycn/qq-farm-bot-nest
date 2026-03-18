import type { OnModuleInit } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import { WsRouterService } from '@/infrastructure/ws/ws-router.service'
import { DeviceHandler } from './device.ws-handler'

@Injectable()
export class DeviceWsRegistrar implements OnModuleInit {
  constructor(
    private readonly router: WsRouterService,
    private readonly deviceHandler: DeviceHandler
  ) {}

  onModuleInit(): void {
    this.router.registerHandlers([this.deviceHandler])
  }
}
