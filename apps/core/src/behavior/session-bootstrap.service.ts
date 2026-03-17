import type { IGameTransport } from '../transport/interfaces/game-transport.interface'
import { Injectable, Logger } from '@nestjs/common'
import { ActionPacerService } from './action-pacer.service'
import { BehaviorResolverService } from './behavior-resolver.service'
import { SESSION_BOOTSTRAP_REQUESTS } from './behavior-script.constants'

@Injectable()
export class SessionBootstrapService {
  private readonly logger = new Logger(SessionBootstrapService.name)

  constructor(
    private readonly resolver: BehaviorResolverService,
    private readonly pacer: ActionPacerService
  ) {}

  async onLoginSuccess(accountId: string, transport: IGameTransport): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (!cfg.session.enableSessionBootstrap)
      return

    this.logger.debug(`[${accountId}] 正在发送会话预热请求`)

    for (const [service, method, params] of SESSION_BOOTSTRAP_REQUESTS) {
      transport.invoke(service, method, params as Record<string, unknown>).catch(() => {})
      await this.pacer.bootstrapStep(accountId)
    }
  }
}
