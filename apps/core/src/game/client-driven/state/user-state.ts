export class UserStateMirror {
  private lastServerTimeMs = 0
  private lastServerTimeAt = 0

  updateServerTime(ms: number) {
    const next = Number(ms) || 0
    if (next <= 0)
      return
    this.lastServerTimeMs = next
    this.lastServerTimeAt = Date.now()
  }

  getServerTimeMeta() {
    return {
      lastServerTimeMs: this.lastServerTimeMs,
      lastServerTimeAt: this.lastServerTimeAt
    }
  }
}
