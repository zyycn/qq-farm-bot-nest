import { getServerTimeSec, toNum } from '@/modules/game/domain/utils'

export interface FriendOperationLimitState {
  dayTimes: number
  dayTimesLimit: number
  dayExpTimes: number
  dayExpTimesLimit: number
}

export interface FriendOperationLimitsDeps {
  log: (msg: string, event?: string) => void
}

export class FriendOperationLimits {
  private lastResetDate = ''
  private operationLimits = new Map<number, FriendOperationLimitState>()
  private canGetHelpExp = true
  private helpAutoDisabledByLimit = false

  constructor(private readonly deps: FriendOperationLimitsDeps) {}

  get canGetHelpExpFlag(): boolean {
    return this.canGetHelpExp
  }

  setCanGetHelpExp(value: boolean) {
    this.canGetHelpExp = value
  }

  update(limits: any[]) {
    if (!limits?.length)
      return
    this.checkDailyReset()
    for (const limit of limits) {
      const id = toNum(limit.id)
      if (id > 0) {
        this.operationLimits.set(id, {
          dayTimes: toNum(limit.day_times),
          dayTimesLimit: toNum(limit.day_times_lt),
          dayExpTimes: toNum(limit.day_exp_times),
          dayExpTimesLimit: toNum(limit.day_ex_times_lt)
        })
      }
    }
  }

  checkDailyReset() {
    const nowSec = getServerTimeSec()
    const nowMs = nowSec > 0 ? nowSec * 1000 : Date.now()
    const bjOffset = 8 * 3600 * 1000
    const bjDate = new Date(nowMs + bjOffset)
    const today = `${bjDate.getUTCFullYear()}-${String(bjDate.getUTCMonth() + 1).padStart(2, '0')}-${String(bjDate.getUTCDate()).padStart(2, '0')}`
    if (this.lastResetDate !== today) {
      if (this.lastResetDate !== '')
        this.deps.log('跨日重置，清空操作限制缓存', 'friend_cycle')
      this.operationLimits.clear()
      this.canGetHelpExp = true
      if (this.helpAutoDisabledByLimit) {
        this.helpAutoDisabledByLimit = false
        this.deps.log('新的一天已开始，自动恢复帮忙操作功能', 'friend_cycle')
      }
      this.lastResetDate = today
    }
  }

  canGetExpByCandidates(opIds: number[]): boolean {
    return opIds.some(id => this.canGetExp(toNum(id)))
  }

  canOperate(opId: number): boolean {
    const limit = this.operationLimits.get(opId)
    if (!limit)
      return true
    if (limit.dayTimesLimit <= 0)
      return true
    return limit.dayTimes < limit.dayTimesLimit
  }

  getRemainingTimes(opId: number): number {
    const limit = this.operationLimits.get(opId)
    if (!limit || limit.dayTimesLimit <= 0)
      return 999
    return Math.max(0, limit.dayTimesLimit - limit.dayTimes)
  }

  getOperationLimits(opTypeNames: Record<number, string>): Record<number, any> {
    const result: Record<number, any> = {}
    for (const id of [10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008]) {
      const limit = this.operationLimits.get(id)
      if (limit) {
        result[id] = { name: opTypeNames[id] || `#${id}`, ...limit, remaining: this.getRemainingTimes(id) }
      }
    }
    return result
  }

  autoDisableHelpByExpLimit() {
    if (!this.canGetHelpExp)
      return
    this.canGetHelpExp = false
    this.helpAutoDisabledByLimit = true
    this.deps.log('今日帮助经验已达上限，自动停止帮忙', 'friend_cycle')
  }

  private canGetExp(opId: number): boolean {
    const limit = this.operationLimits.get(opId)
    if (!limit)
      return false
    if (limit.dayExpTimesLimit <= 0)
      return true
    return limit.dayExpTimes < limit.dayExpTimesLimit
  }
}
