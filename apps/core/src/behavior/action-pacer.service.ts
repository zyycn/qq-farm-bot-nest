import { Injectable } from '@nestjs/common'
import { sleep } from '@qq-farm/shared'
import { BehaviorResolverService } from './behavior-resolver.service'
import { BUILT_IN_SCRIPT_LEGACY_STEP_MS, BUILT_IN_SCRIPT_MAX_STEP_MS } from './behavior-script.constants'

function randomBetween(min: number, max: number): number {
  const lower = Math.max(0, Math.floor(Math.min(min, max)))
  const upper = Math.max(lower, Math.floor(Math.max(min, max)))
  return lower + Math.floor(Math.random() * (upper - lower + 1))
}

@Injectable()
export class ActionPacerService {
  constructor(private readonly resolver: BehaviorResolverService) {}

  wait(ms: number): Promise<void> {
    return sleep(Math.max(0, Math.floor(ms)))
  }

  async rapidFire(accountId: string, legacyMs = 50): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (cfg.effectiveMode === 'legacy')
      return this.wait(legacyMs)
    return this.wait(randomBetween(cfg.delay.rapidBatchMin, cfg.delay.rapidBatchMax))
  }

  async afterResponse(accountId: string, legacyMs = 100): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (cfg.effectiveMode === 'legacy')
      return this.wait(legacyMs)
    return this.wait(randomBetween(cfg.delay.actionMin, cfg.delay.actionMax))
  }

  async action(accountId: string, legacyMs = 200): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (cfg.effectiveMode === 'legacy')
      return this.wait(legacyMs)
    return this.wait(randomBetween(cfg.delay.actionMin, cfg.delay.actionMax))
  }

  async batch(accountId: string, index: number, total: number, legacyMs = 200): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (cfg.effectiveMode === 'legacy')
      return this.wait(legacyMs)

    let delay = randomBetween(cfg.delay.batchMin, cfg.delay.batchMax)

    if (cfg.rhythm.enableGradualPace && total > 3) {
      const progress = Math.max(0, Math.min(1, index / Math.max(1, total - 1)))
      const curve = 1 + 0.6 * Math.sin(progress * Math.PI)
      delay = Math.round(delay * curve)
    }

    if (cfg.rhythm.enableRandomPause && Math.random() < cfg.rhythm.pauseProbability)
      delay += randomBetween(cfg.rhythm.pauseMin, cfg.rhythm.pauseMax)

    return this.wait(delay)
  }

  async taskSwitch(accountId: string, legacyMs = 500): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (cfg.effectiveMode === 'legacy')
      return this.wait(legacyMs)
    return this.wait(randomBetween(cfg.delay.taskSwitchMin, cfg.delay.taskSwitchMax))
  }

  async friendSwitch(accountId: string, legacyMs = 200): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (cfg.effectiveMode === 'legacy')
      return this.wait(legacyMs)
    return this.wait(randomBetween(cfg.delay.friendSwitchMin, cfg.delay.friendSwitchMax))
  }

  async friendBatchRest(accountId: string): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (!cfg.friend.enableBatchLimit)
      return
    return this.wait(randomBetween(cfg.friend.batchRestMin, cfg.friend.batchRestMax))
  }

  async coldStart(accountId: string): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (!cfg.session.enableColdStart)
      return
    return this.wait(randomBetween(cfg.session.coldStartMin, cfg.session.coldStartMax))
  }

  async lingerAfterOperation(accountId: string): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (!cfg.session.enableLingerAfterOps)
      return
    return this.wait(randomBetween(cfg.session.lingerMin, cfg.session.lingerMax))
  }

  getIdleDisconnectDelay(accountId: string): number {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (!cfg.session.enableIdleDisconnect)
      return 0
    return randomBetween(cfg.session.idleDisconnectMin, cfg.session.idleDisconnectMax)
  }

  getStartJitter(accountId: string): number {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (!cfg.multiAccount.enableStartJitter)
      return 0
    return randomBetween(cfg.multiAccount.startJitterMin, cfg.multiAccount.startJitterMax)
  }

  getScheduleOffset(accountId: string): number {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (!cfg.multiAccount.enableScheduleOffset)
      return 0
    return randomBetween(cfg.multiAccount.scheduleOffsetMin, cfg.multiAccount.scheduleOffsetMax)
  }

  async bootstrapStep(accountId: string): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (cfg.effectiveMode === 'legacy')
      return this.wait(BUILT_IN_SCRIPT_LEGACY_STEP_MS)
    const min = Math.min(cfg.delay.rapidBatchMin, BUILT_IN_SCRIPT_LEGACY_STEP_MS)
    const max = Math.max(min, Math.min(cfg.delay.actionMin, BUILT_IN_SCRIPT_MAX_STEP_MS))
    return this.wait(randomBetween(min, max))
  }

  async backgroundRequestStep(accountId: string): Promise<void> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (cfg.effectiveMode === 'legacy')
      return this.wait(BUILT_IN_SCRIPT_LEGACY_STEP_MS)
    const min = Math.min(cfg.delay.rapidBatchMin, BUILT_IN_SCRIPT_LEGACY_STEP_MS)
    const max = Math.max(min, Math.min(cfg.delay.actionMin, BUILT_IN_SCRIPT_MAX_STEP_MS))
    return this.wait(randomBetween(min, max))
  }
}
