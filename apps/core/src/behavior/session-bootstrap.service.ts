import type { IGameTransport } from '../transport/interfaces/game-transport.interface'
import { Injectable, Logger } from '@nestjs/common'
import { BehaviorResolverService } from './behavior-resolver.service'
import { SESSION_BOOTSTRAP_REQUESTS } from './behavior-script.constants'

@Injectable()
export class SessionBootstrapService {
  private readonly logger = new Logger(SessionBootstrapService.name)

  constructor(private readonly resolver: BehaviorResolverService) {}

  async onLoginSuccess(accountId: string, transport: IGameTransport): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (!cfg.session.enableSessionBootstrap)
      return

    this.logger.debug(`[${accountId}] 正在发送会话预热请求`)

    for (const [service, method, params] of SESSION_BOOTSTRAP_REQUESTS) {
      transport.invokeWithPolicy({
        service,
        method,
        params: params as Record<string, unknown>,
        queue: 'script',
        dropIfQueueBusy: true,
        policy: {
          category: 'session_bootstrap',
          risk: 'low',
          source: 'bootstrap'
        }
      }).catch(() => {})
    }
  }
}
