import { Injectable } from '@nestjs/common'
import { AccountLifecycleService } from '@/account/account-lifecycle.service'
import { AccountStatusService } from '@/account/account-status.service'
import { StoreService } from '@/store/store.service'
import { WsAccount } from '../decorators/ws-account.decorator'
import { WsBody } from '../decorators/ws-body.decorator'
import { WsRoute } from '../decorators/ws-route.decorator'

@Injectable()
export class StrategyHandler {
  constructor(
    private readonly store: StoreService,
    private readonly lifecycle: AccountLifecycleService,
    private readonly status: AccountStatusService
  ) {}

  @WsRoute('strategy.query')
  query(@WsAccount() accountId: string): unknown {
    const cfg = this.store.getAccountConfig(accountId)
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
    const result = this.store.applyConfigSnapshot(data || {}, accountId)
    this.lifecycle.applyConfig(accountId)
    this.status.notifyStrategyUpdate(accountId)
    return result
  }
}
