import type { StoreService } from '../../store/store.service'

export interface TaskDailyOverview {
  key: string
  doneToday: boolean
  lastClaimAt: number
  claimableCount: number
  pendingCount: number
  completedCount: number
  totalCount: number
}

export interface GrowthTaskItemOverview {
  id: number
  desc: string
  progress: number
  totalProgress: number
  isClaimed: boolean
  isUnlocked: boolean
  isCompleted: boolean
}

export interface GrowthTaskOverview {
  key: string
  doneToday: boolean
  completedCount: number
  totalCount: number
  tasks: GrowthTaskItemOverview[]
}

export interface DailyRewardCheckState {
  key: string
  doneToday: boolean
  lastCheckAt?: number
  lastClaimAt?: number
}

export interface AccountRunnerOperationsDeps {
  accountId: string
  store: StoreService
  getTaskDailyState: () => Promise<TaskDailyOverview>
  getGrowthTaskState: () => Promise<GrowthTaskOverview>
  getEmailDailyState: () => DailyRewardCheckState
  getFreeGiftDailyState: () => DailyRewardCheckState
  getShareDailyState: () => DailyRewardCheckState
  getVipDailyState: () => DailyRewardCheckState
  getMonthCardDailyState: () => DailyRewardCheckState
  getOpenServerDailyState: () => DailyRewardCheckState
  getFriends: () => Promise<unknown>
  getAlmanac: (refresh?: boolean) => Promise<unknown>
  emitDataEvent: (event: string, data: unknown) => void
  refreshIdleDisconnectTimer: () => void
}

export class AccountRunnerOperations {
  constructor(private readonly deps: AccountRunnerOperationsDeps) {}

  async getDailyGiftOverview() {
    const auto = this.deps.store.getAutomation(this.deps.accountId)
    const taskState = await this.deps.getTaskDailyState()
    const growthState = await this.deps.getGrowthTaskState()
    const emailState = this.deps.getEmailDailyState()
    const freeState = this.deps.getFreeGiftDailyState()
    const shareState = this.deps.getShareDailyState()
    const vipState = this.deps.getVipDailyState()
    const monthState = this.deps.getMonthCardDailyState()
    const openServerState = this.deps.getOpenServerDailyState()

    return {
      date: new Date().toISOString().slice(0, 10),
      growth: { key: 'growth_task', label: '成长任务', doneToday: !!growthState.doneToday, completedCount: growthState.completedCount, totalCount: growthState.totalCount, tasks: growthState.tasks },
      gifts: [
        { key: 'task_claim', label: '每日任务', enabled: !!auto.task, doneToday: !!taskState.doneToday, lastAt: taskState.lastClaimAt, completedCount: taskState.completedCount, totalCount: taskState.totalCount },
        { key: 'email_rewards', label: '邮箱奖励', enabled: !!auto.email, doneToday: !!emailState.doneToday, lastAt: emailState.lastCheckAt },
        { key: 'mall_free_gifts', label: '商城免费礼包', enabled: !!auto.free_gifts, doneToday: !!freeState.doneToday, lastAt: 0 },
        { key: 'daily_share', label: '分享礼包', enabled: !!auto.share_reward, doneToday: !!shareState.doneToday, lastAt: shareState.lastClaimAt },
        { key: 'vip_daily_gift', label: '会员礼包', enabled: !!auto.vip_gift, doneToday: !!vipState.doneToday, lastAt: vipState.lastClaimAt },
        { key: 'month_card_gift', label: '月卡礼包', enabled: !!auto.month_card, doneToday: !!monthState.doneToday, lastAt: monthState.lastClaimAt },
        { key: 'open_server_gift', label: '开服红包', enabled: !!auto.open_server_gift, doneToday: !!openServerState.doneToday, lastAt: openServerState.lastClaimAt }
      ]
    }
  }

  async pushFriends(event: string) {
    try {
      const friends = await this.deps.getFriends()
      if (friends != null)
        this.deps.emitDataEvent(event, friends)
    } catch {}
  }

  async pushAlmanac(event: string, refresh = false) {
    try {
      const overview = await this.deps.getAlmanac(refresh)
      if (overview != null)
        this.deps.emitDataEvent(event, overview)
    } catch {}
  }

  async afterOperation() {
    this.deps.refreshIdleDisconnectTimer()
  }
}
