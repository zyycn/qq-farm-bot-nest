import type { IGameTransport } from '../transport/interfaces/game-transport.interface'
import { Injectable, Logger } from '@nestjs/common'
import { ActionPacerService } from './action-pacer.service'
import { BehaviorResolverService } from './behavior-resolver.service'
import { BACKGROUND_COSMETIC_REQUESTS, BACKGROUND_REQUEST_SAMPLE_RANGE } from './behavior-script.constants'

function pickRandom<T>(items: T[], count: number): T[] {
  return [...items]
    .sort(() => Math.random() - 0.5)
    .slice(0, count)
}

@Injectable()
export class BackgroundRequestService {
  private readonly logger = new Logger(BackgroundRequestService.name)
  private readonly opCounters = new Map<string, number>()

  constructor(
    private readonly resolver: BehaviorResolverService,
    private readonly pacer: ActionPacerService
  ) {}

  async sprinkle(accountId: string, transport: IGameTransport): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (!cfg.backgroundRequests.enabled || cfg.backgroundRequests.frequency <= 0)
      return

    const count = (this.opCounters.get(accountId) || 0) + 1
    this.opCounters.set(accountId, count)

    if (count % cfg.backgroundRequests.frequency !== 0)
      return

    const requestCount = BACKGROUND_REQUEST_SAMPLE_RANGE.min
      + Math.floor(Math.random() * (BACKGROUND_REQUEST_SAMPLE_RANGE.max - BACKGROUND_REQUEST_SAMPLE_RANGE.min + 1))
    const selected = pickRandom([...BACKGROUND_COSMETIC_REQUESTS], requestCount)

    this.logger.debug(`[${accountId}] 正在穿插 ${selected.length} 个背景装饰请求`)

    for (const req of selected) {
      transport.invoke(req.service, req.method, {}).catch(() => {})
      await this.pacer.backgroundRequestStep(accountId)
    }
  }

  resetCounter(accountId: string) {
    this.opCounters.delete(accountId)
  }
}
