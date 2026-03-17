import { Scheduler } from '@qq-farm/shared'

export interface SchedulerCallbacks {
  runFarmTick: () => Promise<void>
  runFriendTick: () => Promise<void>
  isReady: () => boolean
  onScheduleChanged?: () => void
}

export class RunnerScheduler {
  private unifiedRunning = false
  private farmTaskRunning = false
  private friendTaskRunning = false

  nextFarmRunAt = 0
  nextFriendRunAt = 0

  private farmIntervalMin = 60_000
  private farmIntervalMax = 60_000
  private friendIntervalMin = 60_000
  private friendIntervalMax = 120_000

  constructor(
    private readonly scheduler: Scheduler,
    private readonly callbacks: SchedulerCallbacks
  ) {}

  start() {
    if (this.unifiedRunning)
      return
    this.unifiedRunning = true
    this.resetSchedule()
    this.scheduleNext()
  }

  stop() {
    this.unifiedRunning = false
    this.farmTaskRunning = false
    this.friendTaskRunning = false
    this.scheduler.clear('unified_tick')
  }

  resetSchedule() {
    const now = Date.now()
    this.nextFarmRunAt = now + this.randomInterval(this.farmIntervalMin, this.farmIntervalMax)
    this.nextFriendRunAt = now + this.randomInterval(this.friendIntervalMin, this.friendIntervalMax)
  }

  applyIntervals(intervals: { farmMin?: number, farmMax?: number, farm?: number, friendMin?: number, friendMax?: number, friend?: number }) {
    const farmMin = Math.max(1, intervals.farmMin ?? intervals.farm ?? 60)
    const farmMax = Math.max(farmMin, intervals.farmMax ?? farmMin)
    this.farmIntervalMin = farmMin * 1000
    this.farmIntervalMax = farmMax * 1000
    const friendMin = Math.max(1, intervals.friendMin ?? intervals.friend ?? 10)
    const friendMax = Math.max(friendMin, intervals.friendMax ?? 10)
    this.friendIntervalMin = friendMin * 1000
    this.friendIntervalMax = friendMax * 1000
  }

  getScheduleRemains(): { farmRemainSec: number, friendRemainSec: number } {
    const now = Date.now()
    return {
      farmRemainSec: Math.max(0, Math.ceil((this.nextFarmRunAt - now) / 1000)),
      friendRemainSec: Math.max(0, Math.ceil((this.nextFriendRunAt - now) / 1000))
    }
  }

  applyOffset(offsetMs: number) {
    const offset = Math.max(0, Number(offsetMs) || 0)
    if (!offset)
      return
    this.nextFarmRunAt += offset
    this.nextFriendRunAt += offset
    this.callbacks.onScheduleChanged?.()
  }

  private randomInterval(minMs: number, maxMs: number): number {
    const minSec = Math.max(1, Math.floor(Math.max(1000, minMs) / 1000))
    const maxSec = Math.max(minSec, Math.floor(Math.max(1000, maxMs) / 1000))
    if (maxSec === minSec)
      return minSec * 1000
    return (minSec + Math.floor(Math.random() * (maxSec - minSec + 1))) * 1000
  }

  private async runFarmTick() {
    if (this.farmTaskRunning)
      return
    this.farmTaskRunning = true
    try {
      await this.callbacks.runFarmTick()
    } finally {
      this.nextFarmRunAt = Date.now() + this.randomInterval(this.farmIntervalMin, this.farmIntervalMax)
      this.farmTaskRunning = false
      this.callbacks.onScheduleChanged?.()
    }
  }

  private async runFriendTick() {
    if (this.friendTaskRunning)
      return
    this.friendTaskRunning = true
    try {
      await this.callbacks.runFriendTick()
    } finally {
      this.nextFriendRunAt = Date.now() + this.randomInterval(this.friendIntervalMin, this.friendIntervalMax)
      this.friendTaskRunning = false
      this.callbacks.onScheduleChanged?.()
    }
  }

  private scheduleNext() {
    if (!this.unifiedRunning || !this.callbacks.isReady())
      return
    this.scheduler.clear('unified_tick')
    const now = Date.now()
    const nextAt = Math.min(this.nextFarmRunAt || now + 1000, this.nextFriendRunAt || now + 1000)
    const delay = Math.max(1000, nextAt - now)
    this.scheduler.setTimeoutTask('unified_tick', delay, async () => {
      if (!this.unifiedRunning || !this.callbacks.isReady())
        return
      const now2 = Date.now()
      const tasks: Promise<void>[] = []
      if (now2 >= this.nextFarmRunAt)
        tasks.push(this.runFarmTick())
      if (now2 >= this.nextFriendRunAt)
        tasks.push(this.runFriendTick())
      if (tasks.length)
        await Promise.all(tasks)
      this.scheduleNext()
    })
  }

  /** 重置调度并重启下一个 tick */
  reschedule() {
    this.resetSchedule()
    this.scheduleNext()
  }
}
