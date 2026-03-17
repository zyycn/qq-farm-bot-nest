import { Injectable, Logger } from '@nestjs/common'
import { ActionPacerService } from './action-pacer.service'
import { BehaviorResolverService } from './behavior-resolver.service'

@Injectable()
export class SessionPatternService {
  private readonly logger = new Logger(SessionPatternService.name)

  constructor(
    private readonly resolver: BehaviorResolverService,
    private readonly pacer: ActionPacerService
  ) {}

  async applyColdStart(accountId: string): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (!cfg.session.enableColdStart)
      return
    this.logger.debug(`[${accountId}] 正在执行冷启动节奏控制`)
    await this.pacer.coldStart(accountId)
  }

  async applyLinger(accountId: string): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (!cfg.session.enableLingerAfterOps)
      return
    this.logger.debug(`[${accountId}] 正在执行操作后停留节奏控制`)
    await this.pacer.lingerAfterOperation(accountId)
  }

  shouldIdleDisconnect(accountId: string): boolean {
    return this.resolver.getEffectiveConfig(accountId).session.enableIdleDisconnect
  }

  getIdleDisconnectDelay(accountId: string): number {
    return this.pacer.getIdleDisconnectDelay(accountId)
  }

  shouldSessionBootstrap(accountId: string): boolean {
    return this.resolver.getEffectiveConfig(accountId).session.enableSessionBootstrap
  }

  getStartJitter(accountId: string): number {
    return this.pacer.getStartJitter(accountId)
  }

  getScheduleOffset(accountId: string): number {
    return this.pacer.getScheduleOffset(accountId)
  }
}
