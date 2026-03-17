import type { LinkClientService } from '../../transport/link-client.service'
import { Scheduler } from '@qq-farm/shared'

export interface AccountRunnerLifecycleDeps {
  accountId: string
  scheduler: Scheduler
  linkClient: LinkClientService
  getIsRunning: () => boolean
  getLoginReady: () => boolean
  setLoginReady: (value: boolean) => void
  emitConnection: () => void
  emitProfile: () => void
  emitSession: () => void
  emitOperations: () => void
  emitSchedule: () => void
  stopScheduleController?: () => void
  stopDailyController?: () => void
  clearAllSchedulerTasks?: () => void
}

export class AccountRunnerLifecycle {
  constructor(private readonly deps: AccountRunnerLifecycleDeps) {}

  refreshIdleDisconnectTimer() {
    this.deps.scheduler.clear('idle_disconnect')
  }

  async disconnectForIdle() {
    if (!this.deps.getIsRunning() || !this.deps.getLoginReady())
      return
    try {
      await this.deps.linkClient.disconnectAccount(this.deps.accountId)
    } catch {}
    this.deps.setLoginReady(false)
    this.deps.emitConnection()
  }

  syncStatusAfterTick() {
    this.deps.scheduler.clear('status_flush')
    this.flushDeferredStatus()
    this.deps.emitSession()
    this.deps.emitOperations()
    this.deps.emitSchedule()
  }

  deferStatusFlush(delayMs: number) {
    this.deps.scheduler.setTimeoutTask('status_flush', delayMs, () => this.flushDeferredStatus())
  }

  flushDeferredStatus() {
    this.deps.emitProfile()
    this.deps.emitSession()
  }

  stop(target: { isRunning: boolean, loginReady: boolean }) {
    if (!target.isRunning)
      return false

    target.isRunning = false
    target.loginReady = false
    this.deps.stopScheduleController?.()
    this.deps.stopDailyController?.()
    this.deps.clearAllSchedulerTasks?.()
    return true
  }
}
