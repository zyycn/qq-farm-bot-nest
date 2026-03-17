import type { ActiveHoursService } from '../../behavior/active-hours.service'
import type { StoreService } from '../../store/store.service'

export interface DailyRoutineRunOptions {
  force?: boolean
  suppressNoopLogs?: boolean
}

export interface AccountRunnerTicksDeps {
  accountId: string
  store: StoreService
  activeHours: ActiveHoursService
  getIsRunning: () => boolean
  getLoginReady: () => boolean
  ensureConnected: () => Promise<void>
  disconnectForIdle: () => Promise<void>
  runScheduledAutomationPass: () => Promise<unknown>
  checkFriends: () => Promise<unknown>
  afterOperation: () => Promise<void>
  syncStatusAfterTick: () => void
  pushFriends: () => Promise<void>
  getDailyGiftOverview: () => Promise<unknown>
  emitDailyGiftOverview: (overview: unknown) => void
  autoOpenFertilizerGiftPacks: () => Promise<unknown>
  autoBuyFertilizer: (cfg: unknown) => Promise<unknown>
  checkAndClaimEmails: (options?: DailyRoutineRunOptions) => Promise<unknown>
  performDailyShare: (options?: DailyRoutineRunOptions) => Promise<unknown>
  performDailyMonthCardGift: (options?: DailyRoutineRunOptions) => Promise<unknown>
  performDailyOpenServerGift: (options?: DailyRoutineRunOptions) => Promise<unknown>
  buyFreeGifts: (options?: DailyRoutineRunOptions) => Promise<unknown>
  performDailyVipGift: (options?: DailyRoutineRunOptions) => Promise<unknown>
  warn: (msg: string, event?: string) => void
}

export class AccountRunnerTicks {
  constructor(private readonly deps: AccountRunnerTicksDeps) {}

  async runFarmTick() {
    if (!await this.prepareAutomationTick())
      return

    try {
      const auto = this.deps.store.getAutomation(this.deps.accountId)
      if (auto.farm) {
        const result = await this.deps.runScheduledAutomationPass()
        if (result)
          await this.deps.afterOperation()
      }
    } catch (error: any) {
      this.deps.warn(`农场调度执行失败: ${error?.message || error}`, 'schedule_error')
    } finally {
      this.deps.syncStatusAfterTick()
    }
  }

  async runFriendTick() {
    if (!await this.prepareAutomationTick())
      return

    try {
      const auto = this.deps.store.getAutomation(this.deps.accountId)
      if (auto.friend_steal || auto.friend_help || auto.friend_bad) {
        const result = await this.deps.checkFriends()
        if (result)
          await this.deps.afterOperation()
      }
    } catch (error: any) {
      this.deps.warn(`好友调度执行失败: ${error?.message || error}`, 'schedule_error')
    } finally {
      this.deps.syncStatusAfterTick()
      this.deps.pushFriends().catch(() => {})
    }
  }

  async runDailyRoutines(options: DailyRoutineRunOptions = {}) {
    const { force = false, suppressNoopLogs = false } = options

    await this.deps.ensureConnected()
    if (!this.deps.getIsRunning() || !this.deps.getLoginReady())
      return

    const auto = this.deps.store.getAutomation(this.deps.accountId)

    try {
      if (auto.email)
        await this.deps.checkAndClaimEmails({ force, suppressNoopLogs })
      if (auto.fertilizer_gift)
        await this.deps.autoOpenFertilizerGiftPacks()
      if (auto.fertilizer_buy) {
        const cfg = this.deps.store.getAccountConfig(this.deps.accountId).fertilizerBuy
        await this.deps.autoBuyFertilizer(cfg)
      }
      if (auto.share_reward)
        await this.deps.performDailyShare({ force, suppressNoopLogs })
      if (auto.month_card)
        await this.deps.performDailyMonthCardGift({ force, suppressNoopLogs })
      if (auto.open_server_gift)
        await this.deps.performDailyOpenServerGift({ force, suppressNoopLogs })
      if (auto.free_gifts)
        await this.deps.buyFreeGifts({ force, suppressNoopLogs })
      if (auto.vip_gift)
        await this.deps.performDailyVipGift({ force, suppressNoopLogs })

      const overview = await this.deps.getDailyGiftOverview().catch(() => null)
      if (overview != null)
        this.deps.emitDailyGiftOverview(overview)
    } catch (error: any) {
      this.deps.warn(`每日任务调度失败: ${error?.message || error}`, 'schedule_error')
    }
  }

  private async prepareAutomationTick() {
    if (!this.deps.getIsRunning())
      return false
    if (!this.deps.activeHours.isInActiveWindow(this.deps.accountId)) {
      if (this.deps.activeHours.getQuietMode(this.deps.accountId) === 'disconnect')
        await this.deps.disconnectForIdle()
      return false
    }

    await this.deps.ensureConnected()
    return this.deps.getIsRunning() && this.deps.getLoginReady()
  }
}
