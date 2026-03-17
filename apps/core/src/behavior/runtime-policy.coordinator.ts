import { Injectable, Logger } from '@nestjs/common'
import { ActionPacerService } from './action-pacer.service'
import { BehaviorResolverService } from './behavior-resolver.service'

@Injectable()
export class RuntimePolicyCoordinator {
  private readonly logger = new Logger(RuntimePolicyCoordinator.name)

  constructor(
    private readonly resolver: BehaviorResolverService,
    private readonly pacer: ActionPacerService
  ) {}

  async applyColdStart(accountId: string): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (!cfg.session.enableColdStart)
      return
    this.logger.debug(`[${accountId}] applying cold-start runtime policy`)
    await this.pacer.coldStart(accountId)
  }

  async applyLinger(accountId: string): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (!cfg.session.enableLingerAfterOps)
      return
    this.logger.debug(`[${accountId}] applying linger runtime policy`)
    await this.pacer.lingerAfterOperation(accountId)
  }

  async applyStartJitter(startJitterMs: number): Promise<void> {
    if (startJitterMs > 0)
      await this.pacer.wait(startJitterMs)
  }

  shouldSessionBootstrap(accountId: string): boolean {
    return this.resolver.getEffectiveConfig(accountId).session.enableSessionBootstrap
  }

  shouldIdleDisconnect(accountId: string): boolean {
    return this.resolver.getEffectiveConfig(accountId).session.enableIdleDisconnect
  }

  getIdleDisconnectDelay(accountId: string): number {
    return this.pacer.getIdleDisconnectDelay(accountId)
  }

  getStartJitter(accountId: string): number {
    return this.pacer.getStartJitter(accountId)
  }

  getScheduleOffset(accountId: string): number {
    return this.pacer.getScheduleOffset(accountId)
  }
}
