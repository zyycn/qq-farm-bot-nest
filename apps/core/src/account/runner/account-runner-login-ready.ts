import type { LinkUserState } from '../../game/types'
import type { RunnerDaily } from './runner-daily'
import type { RunnerScheduler } from './runner-scheduler'

export interface AccountRunnerLoginReadyDeps {
  accountId: string
  scheduler: RunnerScheduler
  daily: RunnerDaily
  getIsRunning: () => boolean
  onLogin: (userState: LinkUserState) => void
  bootstrapSession: () => Promise<void>
  getCouponBalance: () => number
  initStats: (gold: number, exp: number, coupon: number) => void
  getStatsInitialized: () => boolean
  setStatsInitialized: (value: boolean) => void
  processInviteCodes: () => Promise<void>
  getInviteProcessed: () => boolean
  setInviteProcessed: (value: boolean) => void
  startFriendLoop: () => void
  initTask: () => void
  getPendingScheduleOffsetMs: () => number
  setPendingScheduleOffsetMs: (value: number) => void
  applyScheduleOffset: (value: number) => void
  refreshIdleDisconnectTimer: () => void
  syncStatusAtomic: () => void
  logInviteFailure: (error: unknown) => void
}

export class AccountRunnerLoginReady {
  constructor(private readonly deps: AccountRunnerLoginReadyDeps) {}

  async handle(userState: LinkUserState) {
    const firstLogin = !this.deps.getStatsInitialized()

    await this.deps.bootstrapSession()
    if (!this.deps.getIsRunning())
      return

    const mergedUserState = {
      ...userState,
      coupon: Math.max(0, this.deps.getCouponBalance())
    }
    this.deps.onLogin(mergedUserState)

    if (firstLogin) {
      this.deps.initStats(
        Number(mergedUserState.gold || 0),
        Number(mergedUserState.exp || 0),
        Number(mergedUserState.coupon || 0)
      )
      this.deps.setStatsInitialized(true)
    }

    if (!this.deps.getInviteProcessed()) {
      await this.deps.processInviteCodes().catch(error => this.deps.logInviteFailure(error))
      this.deps.setInviteProcessed(true)
    }

    if (firstLogin) {
      this.deps.startFriendLoop()
      this.deps.initTask()
      this.deps.scheduler.start()

      const scheduleOffset = this.deps.getPendingScheduleOffsetMs()
      if (scheduleOffset > 0) {
        this.deps.applyScheduleOffset(scheduleOffset)
        this.deps.setPendingScheduleOffsetMs(0)
      }

      this.deps.daily.start()
    }
    this.deps.refreshIdleDisconnectTimer()
    this.deps.syncStatusAtomic()
  }
}
