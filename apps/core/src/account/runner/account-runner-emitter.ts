import type { EventEmitter2 } from '@nestjs/event-emitter'
import type { GameConfigService } from '../../game/game-config.service'
import type { GameLogEntry, StatusEventData } from '../../game/types'
import type { AccountStatusEventPayload } from '../account.events'
import type { StatusEventName } from './account-runner'
import { Logger } from '@nestjs/common'
import {
  ACCOUNT_KICKED_EVENT,
  ACCOUNT_LOG_EVENT,
  ACCOUNT_STATUS_EVENT,
  ACCOUNT_WS_ERROR_EVENT
} from '../account.events'

export interface RunnerEmitterDeps {
  accountId: string
  eventEmitter: EventEmitter2
  logger: Logger
  gameConfig: GameConfigService
  getAccountName: () => string
  isConnected: () => boolean
  getUserState: () => {
    name: string
    level: number
    gold: number
    exp: number
    coupon: number
    avatarUrl: string
    openId: string
    platform: string
  }
  getSessionStats: () => {
    bootAt: number
    sessionExpGained: number
    sessionGoldGained: number
    sessionCouponGained: number
    lastExpGain: number
    lastGoldGain: number
    operations: Record<string, unknown>
    level: number
    exp: number
  }
  getSchedulePayload: () => {
    farmRemainSec: number
    friendRemainSec: number
    configRevision: number
  }
}

export class AccountRunnerEmitter {
  constructor(private readonly deps: RunnerEmitterDeps) {}

  emitKicked(reason: string) {
    this.deps.eventEmitter.emit(ACCOUNT_KICKED_EVENT, {
      accountId: this.deps.accountId,
      reason
    })
  }

  emitWsError(code: number, message: string) {
    this.deps.eventEmitter.emit(ACCOUNT_WS_ERROR_EVENT, {
      accountId: this.deps.accountId,
      code,
      message
    })
  }

  emitConnection() {
    this.emitStatusEvent('connection', {
      connected: this.deps.isConnected(),
      accountName: this.deps.getAccountName()
    })
  }

  emitProfile() {
    const userState = this.deps.getUserState()
    this.emitStatusEvent('profile', {
      name: userState.name,
      level: userState.level || 0,
      gold: userState.gold || 0,
      exp: userState.exp || 0,
      coupon: userState.coupon || 0,
      platform: userState.platform || 'qq',
      avatarUrl: userState.avatarUrl || '',
      openId: userState.openId || ''
    })
  }

  emitSession() {
    const stats = this.deps.getSessionStats()
    const levelProgress = this.deps.gameConfig.getLevelExpProgress(stats.level || 0, stats.exp || 0)
    this.emitStatusEvent('session', {
      bootAt: stats.bootAt,
      sessionExpGained: stats.sessionExpGained,
      sessionGoldGained: stats.sessionGoldGained,
      sessionCouponGained: stats.sessionCouponGained,
      lastExpGain: stats.lastExpGain,
      lastGoldGain: stats.lastGoldGain,
      levelProgress
    })
  }

  emitOperations() {
    this.emitStatusEvent('operations', this.deps.getSessionStats().operations as StatusEventData)
  }

  emitSchedule() {
    this.emitStatusEvent('schedule', this.deps.getSchedulePayload())
  }

  emitStatusSnapshot() {
    this.emitConnection()
    this.emitProfile()
    this.emitSession()
    this.emitOperations()
    this.emitSchedule()
  }

  emitTickStatus() {
    this.emitProfile()
    this.emitSession()
    this.emitOperations()
    this.emitSchedule()
  }

  emitData(event: string, data: unknown) {
    this.deps.eventEmitter.emit(event, {
      accountId: this.deps.accountId,
      data
    })
  }

  forwardLog(entry: GameLogEntry) {
    this.deps.eventEmitter.emit(ACCOUNT_LOG_EVENT, {
      accountId: this.deps.accountId,
      accountName: this.deps.getAccountName(),
      entry
    })
  }

  log(msg: string, event?: string) {
    this.deps.logger.log(msg)
    this.forwardLog({ msg, tag: '系统', meta: { module: 'system', ...(event && { event }) }, isWarn: false })
  }

  warn(msg: string, event?: string) {
    this.deps.logger.warn(msg)
    this.forwardLog({ msg, tag: '系统', meta: { module: 'system', ...(event && { event }) }, isWarn: true })
  }

  private emitStatusEvent(event: StatusEventName, data: StatusEventData) {
    const payload: AccountStatusEventPayload = {
      accountId: this.deps.accountId,
      event,
      data,
      accountName: this.deps.getAccountName()
    }
    this.deps.eventEmitter.emit(ACCOUNT_STATUS_EVENT, payload)
  }
}
