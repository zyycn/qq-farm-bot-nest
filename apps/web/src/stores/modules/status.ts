import type {
  AccountRealtimeStatus,
  DailyGiftsResponse,
  LogEntry,
  StatusConnectionPayload,
  StatusSchedulePayload,
  StatusUpdatePayload
} from '@/api/types'
import { defineStore } from 'pinia'
import { socket } from '@/api'
import { LOGS_MAX_LENGTH } from '../constants'

const CHINA_TZ = 'Asia/Shanghai'

function formatTimeChina(ts: number): string {
  return new Date(ts).toLocaleString('sv-SE', { timeZone: CHINA_TZ })
}

function normalizeLogEntry(input: unknown): LogEntry {
  const entry = (input && typeof input === 'object') ? { ...input } : {}
  const createdAt = Number(entry.createdAt) || Number(entry.ts) || Date.parse(String(entry.time || '')) || Date.now()
  return {
    ...entry,
    createdAt,
    time: entry.time || formatTimeChina(createdAt)
  }
}

function normalizeStatusPayload(input: unknown): AccountRealtimeStatus {
  return (input && typeof input === 'object') ? { ...input } : {}
}

export const useStatusStore = defineStore('status', {
  state: () => ({
    status: null as AccountRealtimeStatus | null,
    logs: [] as LogEntry[],
    logFilterActive: false,
    dailyGifts: null as DailyGiftsResponse | null
  }),
  getters: {
    realtimeConnected() {
      return socket.connected
    },
    subscribedResolvedAccountId() {
      return socket.subscribedAccountId
    }
  },
  actions: {
    pushRealtimeLog(entry: unknown) {
      if (this.logFilterActive)
        return
      const next = normalizeLogEntry(entry)
      this.logs.push(next)
      if (this.logs.length > LOGS_MAX_LENGTH)
        this.logs = this.logs.slice(-LOGS_MAX_LENGTH)
    },
    setLogs(list: LogEntry[]) {
      this.logs = Array.isArray(list) ? list.map(item => normalizeLogEntry(item)) : []
    },
    setLogFilterActive(active: boolean) {
      this.logFilterActive = !!active
    },
    ensureStatusObject() {
      if (this.status == null || typeof this.status !== 'object')
        this.status = {}
    },
    applyStatusUpdate(data: StatusUpdatePayload | null | undefined) {
      if (data && typeof data === 'object' && data.status)
        this.status = normalizeStatusPayload(data.status)
      else
        this.status = null
    },
    applyStatusConnection(data: StatusConnectionPayload | null | undefined) {
      this.ensureStatusObject()
      this.status!.connection = { connected: !!data?.connected }
      if (data?.wsError != null)
        this.status!.wsError = data.wsError
    },
    applyStatusProfile(data: AccountRealtimeStatus['status']) {
      this.ensureStatusObject()
      this.status!.status = data
    },
    applyStatusSession(data: Partial<AccountRealtimeStatus> | null | undefined) {
      this.ensureStatusObject()
      const s = this.status!
      if (data?.bootAt !== undefined)
        s.bootAt = data.bootAt
      if (data?.sessionExpGained !== undefined)
        s.sessionExpGained = data.sessionExpGained
      if (data?.sessionGoldGained !== undefined)
        s.sessionGoldGained = data.sessionGoldGained
      if (data?.sessionCouponGained !== undefined)
        s.sessionCouponGained = data.sessionCouponGained
      if (data?.lastExpGain !== undefined)
        s.lastExpGain = data.lastExpGain
      if (data?.lastGoldGain !== undefined)
        s.lastGoldGain = data.lastGoldGain
      if (data?.levelProgress !== undefined)
        s.levelProgress = data.levelProgress
    },
    applyStatusOperations(data: Record<string, number>) {
      this.ensureStatusObject()
      this.status!.operations = data
    },
    applyStatusSchedule(data: StatusSchedulePayload | null | undefined) {
      this.ensureStatusObject()
      const s = this.status!
      s.nextChecks = {
        farmRemainSec: data?.farmRemainSec ?? 0,
        friendRemainSec: data?.friendRemainSec ?? 0
      }
      if (data?.configRevision !== undefined)
        s.configRevision = data.configRevision
    },
    applyDailyGifts(data: DailyGiftsResponse | null | undefined) {
      if (data != null)
        this.dailyGifts = data
    }
  },
  persist: {
    storage: localStorage
  }
})
