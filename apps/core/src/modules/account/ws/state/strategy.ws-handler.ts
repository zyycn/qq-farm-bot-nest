import { Injectable } from '@nestjs/common'
import { WsAccount } from '@/infrastructure/ws/decorators/ws-account.decorator'
import { WsBody } from '@/infrastructure/ws/decorators/ws-body.decorator'
import { WsRoute } from '@/infrastructure/ws/decorators/ws-route.decorator'
import { AccountLifecycleService } from '@/modules/account/application/account-lifecycle.service'
import { AccountStatusService } from '@/modules/account/application/account-status.service'
import { AccountConfigService } from '@/modules/account/persistence/account-config.service'

@Injectable()
export class StrategyHandler {
  constructor(
    private readonly accountConfig: AccountConfigService,
    private readonly lifecycle: AccountLifecycleService,
    private readonly status: AccountStatusService
  ) {}

  @WsRoute('strategy.query')
  query(@WsAccount() accountId: string): unknown {
    const cfg = this.accountConfig.getAccountConfig(accountId)
    return {
      intervals: cfg.intervals,
      plantingStrategy: cfg.plantingStrategy,
      preferredSeedId: cfg.preferredSeedId,
      bagSeedPriority: cfg.bagSeedPriority,
      friendQuietHours: cfg.friendQuietHours,
      stealCropBlacklist: cfg.stealCropBlacklist,
      friendBlacklist: cfg.friendBlacklist,
      automation: cfg.automation,
      fertilizer: cfg.fertilizer,
      fertilizerLandTypes: cfg.fertilizerLandTypes,
      fertilizerMultiSeason: cfg.fertilizerMultiSeason,
      fertilizerBuy: cfg.fertilizerBuy,
      deviceProfileId: cfg.deviceProfileId
    }
  }

  @WsRoute('strategy.update')
  save(
    @WsAccount() accountId: string,
    @WsBody() data: Record<string, unknown>
  ): unknown {
    const result = this.accountConfig.applyConfigSnapshot(data || {}, accountId)
    this.lifecycle.applyConfig(accountId)
    this.status.notifyStrategyUpdate(accountId)
    return result
  }
}
