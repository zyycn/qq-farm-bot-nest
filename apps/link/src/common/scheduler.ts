interface TaskMeta {
  kind: 'timeout' | 'interval'
  delayMs: number
  running: boolean
  preventOverlap: boolean
  handle: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null
}

export class Scheduler {
  private timers = new Map<string, TaskMeta>()

  constructor(private namespace: string) {}

  clear(taskName: string): boolean {
    const entry = this.timers.get(taskName)
    if (!entry)
      return false
    this.timers.delete(taskName)
    if (entry.kind === 'interval')
      clearInterval(entry.handle as ReturnType<typeof setInterval>)
    else
      clearTimeout(entry.handle as ReturnType<typeof setTimeout>)
    return true
  }

  clearAll() {
    for (const key of Array.from(this.timers.keys()))
      this.clear(key)
  }

  setTimeoutTask(taskName: string, delayMs: number, taskFn: () => any): ReturnType<typeof setTimeout> {
    this.clear(taskName)
    const delay = Math.max(0, Math.floor(Number(delayMs) || 0))
    const entry: TaskMeta = { kind: 'timeout', delayMs: delay, running: false, preventOverlap: true, handle: null }

    const handle = setTimeout(async () => {
      const current = this.timers.get(taskName)
      if (!current || current.handle !== handle)
        return
      current.running = true
      try {
        await taskFn()
      } catch (e: any) {
        console.warn(`[Scheduler:${this.namespace}] timeout task failed: ${taskName} - ${e?.message}`)
      } finally {
        const after = this.timers.get(taskName)
        if (after && after.handle === handle)
          this.timers.delete(taskName)
      }
    }, delay)
    entry.handle = handle
    this.timers.set(taskName, entry)
    return handle
  }

  setIntervalTask(taskName: string, intervalMs: number, taskFn: () => any, options: { preventOverlap?: boolean } = {}): ReturnType<typeof setInterval> {
    this.clear(taskName)
    const delay = Math.max(1, Math.floor(Number(intervalMs) || 1000))
    const preventOverlap = options.preventOverlap !== false
    const entry: TaskMeta = { kind: 'interval', delayMs: delay, running: false, preventOverlap, handle: null }

    const runner = async () => {
      const current = this.timers.get(taskName)
      if (!current)
        return
      if (preventOverlap && current.running)
        return
      current.running = true
      try {
        await taskFn()
      } catch (e: any) {
        console.warn(`[Scheduler:${this.namespace}] interval task failed: ${taskName} - ${e?.message}`)
      } finally {
        const updated = this.timers.get(taskName)
        if (updated)
          updated.running = false
      }
    }

    const handle = setInterval(runner, delay)
    entry.handle = handle
    this.timers.set(taskName, entry)
    return handle
  }
}
