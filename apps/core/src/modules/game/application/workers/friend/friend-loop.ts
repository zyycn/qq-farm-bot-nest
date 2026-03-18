import { Scheduler } from '@qq-farm/shared'

export interface FriendLoopHandlerDeps {
  scheduler: Scheduler
  client: {
    on: (event: string, listener: (...args: any[]) => void) => void
    removeListener: (event: string, listener: (...args: any[]) => void) => void
  }
  getLoopRunning: () => boolean
  setLoopRunning: (value: boolean) => void
  getExternalScheduler: () => boolean
  setExternalScheduler: (value: boolean) => void
  checkFriends: () => Promise<boolean>
  checkAndAcceptApplications: () => Promise<void>
  onFriendApplicationReceived: (applications: any[]) => void
}

export class FriendLoopHandler {
  constructor(private readonly deps: FriendLoopHandlerDeps) {}

  start(options: { externalScheduler?: boolean } = {}) {
    if (this.deps.getLoopRunning())
      return
    this.deps.setExternalScheduler(!!options.externalScheduler)
    this.deps.setLoopRunning(true)
    this.deps.client.on('friendApplicationReceived', this.deps.onFriendApplicationReceived)
    if (!this.deps.getExternalScheduler())
      this.deps.scheduler.setTimeoutTask('friend_check_loop', 5000, () => this.friendCheckLoop())
    this.deps.scheduler.setTimeoutTask('friend_check_bootstrap_applications', 3000, () => this.deps.checkAndAcceptApplications())
  }

  stop() {
    this.deps.setLoopRunning(false)
    this.deps.setExternalScheduler(false)
    this.deps.client.removeListener('friendApplicationReceived', this.deps.onFriendApplicationReceived)
    this.deps.scheduler.clearAll()
  }

  refresh(delayMs = 200) {
    if (!this.deps.getLoopRunning() || this.deps.getExternalScheduler())
      return
    this.deps.scheduler.setTimeoutTask('friend_check_loop', Math.max(0, delayMs), () => this.friendCheckLoop())
  }

  async friendCheckLoop() {
    if (this.deps.getExternalScheduler() || !this.deps.getLoopRunning())
      return
    await this.deps.checkFriends()
    if (this.deps.getLoopRunning())
      this.deps.scheduler.setTimeoutTask('friend_check_loop', 10_000, () => this.friendCheckLoop())
  }
}
