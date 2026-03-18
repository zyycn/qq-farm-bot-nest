import type { DailyRoutineRunOptions } from './account-runner'
import { Scheduler } from '@qq-farm/shared'

export interface DailyRoutineCallbacks {
  runDailyRoutines: (options?: DailyRoutineRunOptions) => Promise<void>
  isReady: () => boolean
  getDateKey: () => string
}

export class RunnerDaily {
  private static readonly CHECK_INTERVAL_MS = 30_000
  private lastRunDate = ''

  constructor(
    private readonly scheduler: Scheduler,
    private readonly callbacks: DailyRoutineCallbacks
  ) {}

  start() {
    this.stop()
    this.lastRunDate = this.callbacks.getDateKey()
    this.callbacks.runDailyRoutines({ force: false, suppressNoopLogs: true }).catch(() => {})
    this.scheduler.setIntervalTask('daily_routine_interval', RunnerDaily.CHECK_INTERVAL_MS, () => {
      if (!this.callbacks.isReady())
        return
      const today = this.callbacks.getDateKey()
      if (today === this.lastRunDate)
        return
      this.lastRunDate = today
      this.callbacks.runDailyRoutines({ force: false, suppressNoopLogs: false }).catch(() => {})
    })
  }

  stop() {
    this.scheduler.clear('daily_routine_interval')
  }
}
