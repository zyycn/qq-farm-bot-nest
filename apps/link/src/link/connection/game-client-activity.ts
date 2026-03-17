import type { ProtoTypeRegistry } from '../proto/proto-runtime'
import type { MessageCallback } from './game-client-message'
import { Buffer } from 'node:buffer'
import { HEARTBEAT_INTERVAL_MS, Scheduler, syncServerTime } from '@qq-farm/shared'
import { buildHeartbeatRequestBody, parseHeartbeatServerTime } from './game-client-packets'

interface GameClientActivityOptions {
  scheduler: Scheduler
  protoTypes: ProtoTypeRegistry
  clientVersion: string
  isConnected: () => boolean
  getUserGid: () => number
  sendMsg: (serviceName: string, methodName: string, bodyBytes: Buffer, callback?: MessageCallback) => Promise<boolean>
  onConnectionStale: () => void
  onServerTime: (ms: number) => void
}

export class GameClientActivityController {
  private lastHeartbeatResponse = Date.now()
  private heartbeatMissCount = 0
  private lastBcrfTime = 0
  private bcrfWindowStart = 0

  constructor(private readonly options: GameClientActivityOptions) {}

  resetOnLogin(): void {
    this.options.scheduler.clear('heartbeat_interval')
    this.lastHeartbeatResponse = Date.now()
    this.heartbeatMissCount = 0
    this.lastBcrfTime = Date.now()

    this.options.scheduler.setTimeoutTask(
      'bcrf_first',
      3000 + Math.floor(Math.random() * 5000),
      () => this.sendBcrf()
    )

    this.options.scheduler.setIntervalTask('heartbeat_interval', HEARTBEAT_INTERVAL_MS, () => {
      const gid = this.options.getUserGid()
      if (!gid)
        return

      const timeSince = Date.now() - this.lastHeartbeatResponse
      if (timeSince > 60000) {
        this.heartbeatMissCount++
        if (this.heartbeatMissCount >= 2)
          this.options.onConnectionStale()
      }

      const body = buildHeartbeatRequestBody(this.options.protoTypes, gid, this.options.clientVersion)
      this.options.sendMsg('gamepb.userpb.UserService', 'Heartbeat', body, (err, replyBody) => {
        if (err || !replyBody)
          return
        this.lastHeartbeatResponse = Date.now()
        this.heartbeatMissCount = 0
        try {
          const ms = parseHeartbeatServerTime(this.options.protoTypes, replyBody)
          if (ms != null) {
            syncServerTime(ms)
            this.options.onServerTime(ms)
          }
        } catch {}
      }).catch(() => {})

      const bcrfElapsed = Date.now() - this.lastBcrfTime
      const bcrfIdleThreshold = 40000 + Math.floor(Math.random() * 80000)
      if (bcrfElapsed > bcrfIdleThreshold)
        this.sendBcrf()
    })
  }

  scheduleBcrf(): void {
    const now = Date.now()
    const isNew = !this.options.scheduler.has('bcrf_debounce')
    if (isNew)
      this.bcrfWindowStart = now

    const elapsed = now - this.bcrfWindowStart
    const maxRemaining = Math.max(0, 12000 - elapsed)
    if (maxRemaining <= 0) {
      this.options.scheduler.clear('bcrf_debounce')
      this.bcrfWindowStart = 0
      this.sendBcrf()
      return
    }

    const randomDelay = 3000 + Math.floor(Math.random() * 7000)
    const delay = Math.min(randomDelay, maxRemaining)

    this.options.scheduler.clear('bcrf_debounce')
    this.options.scheduler.setTimeoutTask('bcrf_debounce', delay, () => {
      this.bcrfWindowStart = 0
      this.sendBcrf()
    })
  }

  clear(): void {
    this.options.scheduler.clear('heartbeat_interval')
    this.options.scheduler.clear('bcrf_first')
    this.options.scheduler.clear('bcrf_debounce')
  }

  private sendBcrf(): void {
    const requestType = this.options.protoTypes.BatchClientReportFlowRequest
    if (!requestType || !this.options.isConnected())
      return

    const body = Buffer.from(requestType.encode(requestType.create({})).finish())
    this.options.sendMsg('gamepb.userpb.UserService', 'BatchClientReportFlow', body).catch(() => {})
    this.lastBcrfTime = Date.now()
  }
}
