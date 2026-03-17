import type { BehaviorConfig, BehaviorMode, EffectiveBehaviorConfig } from './behavior.types'
import { Injectable } from '@nestjs/common'
import { BehaviorConfigService } from './behavior-config.service'
import { resolveEffectiveBehaviorConfig } from './behavior.types'

@Injectable()
export class BehaviorResolverService {
  constructor(private readonly config: BehaviorConfigService) {}

  getStoredConfig(accountId: string): BehaviorConfig {
    return this.config.getConfig(accountId)
  }

  getEffectiveConfig(accountId: string): EffectiveBehaviorConfig {
    return resolveEffectiveBehaviorConfig(this.getStoredConfig(accountId))
  }

  getRequestedMode(accountId: string): BehaviorMode {
    return this.getStoredConfig(accountId).mode
  }

  getEffectiveMode(accountId: string): BehaviorMode {
    return this.getEffectiveConfig(accountId).effectiveMode
  }

  isQuickFallbackActive(accountId: string): boolean {
    return this.getEffectiveConfig(accountId).quickFallbackActive
  }
}
