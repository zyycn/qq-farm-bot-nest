import type { LinkEventMap, LinkEventName, LinkUserState } from '../../game/types'
import type { IGameTransport } from '../../transport/interfaces/game-transport.interface'
import { syncServerTime } from '@qq-farm/shared'

export interface AccountRunnerLinkEventsDeps {
  transport: IGameTransport
  getLoginReady: () => boolean
  setLoginReady: (ready: boolean) => void
  getUserState: () => LinkUserState
  setUserState: (state: LinkUserState) => void
  recordLevelUp: () => void
  log: (msg: string, event?: string) => void
  warn: (msg: string, event?: string) => void
  emitConnection: () => void
  syncStatusAtomic: () => void
  deferStatusFlush: () => void
  pushAlmanac: (refresh?: boolean) => Promise<void>
  scheduleTask: (name: string, delay: number, task: () => void | Promise<void>) => void
  handleNotify: (data: LinkEventMap['notify']) => void
  handleServerTime: (ms: number) => void
  emitKicked: (payload: LinkEventMap['kicked']) => void
  emitWsError: (payload: LinkEventMap['ws_error']) => void
}

export class AccountRunnerLinkEvents {
  constructor(private readonly deps: AccountRunnerLinkEventsDeps) {}

  build(): { [E in LinkEventName]?: (data: LinkEventMap[E]) => void } {
    return {
      kicked: data => this.deps.emitKicked(data),
      ws_error: data => this.deps.emitWsError(data),
      reconnecting: data => this.deps.log(`WS 断开，正在重连 (${data.attempt}/${data.maxAttempts})...`, 'reconnecting'),
      disconnected: () => {
        if (this.deps.getLoginReady()) {
          this.deps.setLoginReady(false)
          this.deps.emitConnection()
        }
      },
      login_failed: (data) => {
        this.deps.warn(`登录失败: ${data.error || '未知原因'}，code 可能已过期`, 'login_failed')
        if (this.deps.getLoginReady()) {
          this.deps.setLoginReady(false)
          this.deps.emitConnection()
        }
      },
      connected: (data) => {
        this.deps.setUserState({
          ...this.deps.getUserState(),
          ...data
        })
        this.deps.setLoginReady(true)
        this.deps.syncStatusAtomic()
      },
      state_update: (data) => {
        const previous = this.deps.getUserState()
        const oldLevel = Number(previous.level || 0)
        const merged = { ...previous, ...data }
        if (Number(data.coupon) === 0 && Number(previous.coupon) > 0)
          merged.coupon = previous.coupon
        this.deps.setUserState(merged)

        if (merged.level != null && Number(merged.level) > oldLevel && oldLevel > 0) {
          this.deps.recordLevelUp()
          this.deps.log(`账号升级至 Lv${merged.level}`, 'level_up')
        }

        this.deps.deferStatusFlush()
      },
      notify: (data) => {
        const kind = String(data?.kind || '')
        if (kind === 'illustrated_reward' || kind === 'illustrated_change') {
          this.deps.scheduleTask('almanac_notify_refresh', 300, () => this.deps.pushAlmanac(true))
        }
        this.deps.handleNotify(data)
      },
      taskInfoNotify: (data) => {
        this.deps.transport.emit('taskInfoNotify', data)
      },
      server_time: (data) => {
        const ms = Number((data as any)?.ms || 0)
        if (ms > 0) {
          syncServerTime(ms)
          this.deps.handleServerTime(ms)
        }
      }
    }
  }
}
