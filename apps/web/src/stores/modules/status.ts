import { defineStore } from 'pinia'
import { ref } from 'vue'
import { logsApi, statusApi, ws } from '@/api'
import { LOGS_MAX_LENGTH } from '../constants'

interface DailyGift {
  key: string
  label: string
  enabled?: boolean
  doneToday: boolean
  lastAt?: number
  completedCount?: number
  totalCount?: number
  tasks?: any[]
}

interface DailyGiftsResponse {
  date: string
  growth: DailyGift
  gifts: DailyGift[]
}

export const useStatusStore = defineStore('status', () => {
  const status = ref<any>(null)
  const logs = ref<any[]>([])
  const logFilterActive = ref(false)
  const dailyGifts = ref<DailyGiftsResponse | null>(null)

  function normalizeStatusPayload(input: any): Record<string, any> {
    return (input && typeof input === 'object') ? { ...input } : {}
  }

  const CHINA_TZ = 'Asia/Shanghai'

  function formatTimeChina(ts: number): string {
    return new Date(ts).toLocaleString('sv-SE', { timeZone: CHINA_TZ })
  }

  function normalizeLogEntry(input: any): Record<string, any> {
    const entry = (input && typeof input === 'object') ? { ...input } : {}
    const createdAt = Number(entry.createdAt) || Number(entry.ts) || Date.parse(String(entry.time || '')) || Date.now()
    return {
      ...entry,
      createdAt,
      time: entry.time || formatTimeChina(createdAt)
    }
  }

  function pushRealtimeLog(entry: any): void {
    if (logFilterActive.value)
      return
    const next = normalizeLogEntry(entry)
    logs.value.push(next)
    if (logs.value.length > LOGS_MAX_LENGTH)
      logs.value = logs.value.slice(-LOGS_MAX_LENGTH)
  }

  function setLogs(list: any[]): void {
    logs.value = Array.isArray(list) ? list.map((item: any) => normalizeLogEntry(item)) : []
  }

  function setLogFilterActive(active: boolean): void {
    logFilterActive.value = !!active
  }

  function ensureStatusObject(): void {
    if (status.value == null || typeof status.value !== 'object')
      status.value = {}
  }

  function resetState(): void {
    status.value = null
    logs.value = []
    logFilterActive.value = false
    dailyGifts.value = null
  }

  statusApi.onStatusUpdate((data: any) => {
    if (data && typeof data === 'object' && data.status) {
      status.value = normalizeStatusPayload(data.status)
    } else {
      status.value = null
    }
  })

  statusApi.onStatusConnection((data: any) => {
    ensureStatusObject()
    status.value!.connection = { connected: !!data?.connected }
    if (data?.wsError != null)
      (status.value as any).wsError = data.wsError
  })

  statusApi.onStatusProfile((data: any) => {
    ensureStatusObject()
    status.value!.status = data
  })

  statusApi.onStatusSession((data: any) => {
    ensureStatusObject()
    const s = status.value!
    if (data?.uptime !== undefined)
      s.uptime = data.uptime
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
  })

  statusApi.onStatusOperations((data: any) => {
    ensureStatusObject()
    status.value!.operations = data
  })

  statusApi.onStatusSchedule((data: any) => {
    ensureStatusObject()
    const s = status.value!
    s.nextChecks = {
      farmRemainSec: data?.farmRemainSec ?? 0,
      friendRemainSec: data?.friendRemainSec ?? 0
    }
    if (data?.configRevision !== undefined)
      s.configRevision = data.configRevision
  })

  logsApi.onLogNew((data: any) => {
    pushRealtimeLog(data)
  })

  statusApi.onDailyGiftsUpdate((data: any) => {
    if (data != null)
      dailyGifts.value = data
  })

  return {
    status,
    logs,
    logFilterActive,
    setLogs,
    setLogFilterActive,
    dailyGifts,
    realtimeConnected: ws.connected,
    subscribedResolvedAccountId: ws.subscribedAccountId,
    resetState
  }
}, {
  persist: {
    storage: sessionStorage
  }
})
