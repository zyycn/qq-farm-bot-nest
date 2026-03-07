import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ws } from '@/api/services/ws'
import { LOGS_MAX_LENGTH } from '../constants'
import { useAccountStore } from './account'
import { useBagStore } from './bag'
import { useFarmStore } from './farm'
import { useFriendStore } from './friend'
import { useSettingStore } from './setting'

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

  function normalizeStatusPayload(input: any) {
    return (input && typeof input === 'object') ? { ...input } : {}
  }

  const CHINA_TZ = 'Asia/Shanghai'

  function formatTimeChina(ts: number): string {
    return new Date(ts).toLocaleString('sv-SE', { timeZone: CHINA_TZ })
  }

  function normalizeLogEntry(input: any) {
    const entry = (input && typeof input === 'object') ? { ...input } : {}
    const createdAt = Number(entry.createdAt) || Number(entry.ts) || Date.parse(String(entry.time || '')) || Date.now()
    return {
      ...entry,
      createdAt,
      time: entry.time || formatTimeChina(createdAt)
    }
  }

  function pushRealtimeLog(entry: any) {
    if (logFilterActive.value)
      return
    const next = normalizeLogEntry(entry)
    logs.value.push(next)
    if (logs.value.length > LOGS_MAX_LENGTH)
      logs.value = logs.value.slice(-LOGS_MAX_LENGTH)
  }

  function setLogs(list: any[]) {
    logs.value = Array.isArray(list) ? list.map((item: any) => normalizeLogEntry(item)) : []
  }

  function setLogFilterActive(active: boolean) {
    logFilterActive.value = !!active
  }

  function ensureStatusAccountMatch(accountId: string) {
    const resolved = ws.subscribedAccountId.value
    return !resolved || !accountId || accountId === resolved
  }

  function ensureStatusObject() {
    if (status.value == null || typeof status.value !== 'object')
      status.value = {}
  }

  function handleRealtimeStatus(payload: any) {
    const body = (payload && typeof payload === 'object') ? payload : {}
    const incomingId = String(body.accountId || '').trim()
    if (!ensureStatusAccountMatch(incomingId))
      return
    if (body.status && typeof body.status === 'object') {
      status.value = normalizeStatusPayload(body.status)
    } else {
      status.value = null
    }
  }

  function handleStatusConnection(payload: any) {
    const body = (payload && typeof payload === 'object') ? payload : {}
    if (!ensureStatusAccountMatch(String(body.accountId || '').trim()))
      return
    ensureStatusObject()
    status.value!.connection = { connected: !!body.connected }
    if (body.wsError != null)
      (status.value as any).wsError = body.wsError
  }

  function handleStatusProfile(payload: any) {
    const body = (payload && typeof payload === 'object') ? payload : {}
    if (!ensureStatusAccountMatch(String(body.accountId || '').trim()))
      return
    ensureStatusObject()
    const { accountId: _id, ...profile } = body
    status.value!.status = profile
  }

  function handleStatusSession(payload: any) {
    const body = (payload && typeof payload === 'object') ? payload : {}
    if (!ensureStatusAccountMatch(String(body.accountId || '').trim()))
      return
    ensureStatusObject()
    const s = status.value!
    if (body.uptime !== undefined)
      s.uptime = body.uptime
    if (body.sessionExpGained !== undefined)
      s.sessionExpGained = body.sessionExpGained
    if (body.sessionGoldGained !== undefined)
      s.sessionGoldGained = body.sessionGoldGained
    if (body.sessionCouponGained !== undefined)
      s.sessionCouponGained = body.sessionCouponGained
    if (body.lastExpGain !== undefined)
      s.lastExpGain = body.lastExpGain
    if (body.lastGoldGain !== undefined)
      s.lastGoldGain = body.lastGoldGain
    if (body.levelProgress !== undefined)
      s.levelProgress = body.levelProgress
  }

  function handleStatusOperations(payload: any) {
    const body = (payload && typeof payload === 'object') ? payload : {}
    if (!ensureStatusAccountMatch(String(body.accountId || '').trim()))
      return
    ensureStatusObject()
    const { accountId: _id, ...ops } = body
    status.value!.operations = ops
  }

  function handleStatusSchedule(payload: any) {
    const body = (payload && typeof payload === 'object') ? payload : {}
    if (!ensureStatusAccountMatch(String(body.accountId || '').trim()))
      return
    ensureStatusObject()
    const s = status.value!
    s.nextChecks = {
      farmRemainSec: body.farmRemainSec ?? 0,
      friendRemainSec: body.friendRemainSec ?? 0
    }
    if (body.configRevision !== undefined)
      s.configRevision = body.configRevision
  }

  function handleRealtimeLog(payload: any) {
    pushRealtimeLog(payload)
  }

  function handleAccountsUpdate(payload: any) {
    const data = payload && typeof payload === 'object' ? payload : {}
    useAccountStore().setAccountsFromRealtime(data)
  }

  function handleLandsUpdate(payload: any) {
    const body = payload && typeof payload === 'object' ? payload : {}
    const accountId = String(body.accountId || '').trim()
    if (accountId && ws.subscribedAccountId.value && accountId !== ws.subscribedAccountId.value)
      return
    if (body.data != null)
      useFarmStore().setLandsFromRealtime(body.data)
  }

  function handleSeedsUpdate(payload: any) {
    const body = payload && typeof payload === 'object' ? payload : {}
    const accountId = String(body.accountId || '').trim()
    if (accountId && ws.subscribedAccountId.value && accountId !== ws.subscribedAccountId.value)
      return
    if (body.data != null)
      useFarmStore().setSeedsFromRealtime(Array.isArray(body.data) ? body.data : [])
  }

  function handleBagUpdate(payload: any) {
    const body = payload && typeof payload === 'object' ? payload : {}
    const accountId = String(body.accountId || '').trim()
    if (accountId && ws.subscribedAccountId.value && accountId !== ws.subscribedAccountId.value)
      return
    if (body.data != null)
      useBagStore().setBagFromRealtime(body.data)
  }

  function handleDailyGiftsUpdate(payload: any) {
    const body = payload && typeof payload === 'object' ? payload : {}
    const accountId = String(body.accountId || '').trim()
    if (accountId && ws.subscribedAccountId.value && accountId !== ws.subscribedAccountId.value)
      return
    if (body.data != null)
      dailyGifts.value = body.data
  }

  function handleFriendsUpdate(payload: any) {
    const body = payload && typeof payload === 'object' ? payload : {}
    const accountId = String(body.accountId || '').trim()
    if (accountId && ws.subscribedAccountId.value && accountId !== ws.subscribedAccountId.value)
      return
    if (body.data != null)
      useFriendStore().setFriendsFromRealtime(Array.isArray(body.data) ? body.data : [])
  }

  function handleSettingsUpdate(payload: any) {
    const body = payload && typeof payload === 'object' ? payload : {}
    const accountId = String(body.accountId || '').trim()
    if (accountId && ws.subscribedAccountId.value && accountId !== ws.subscribedAccountId.value)
      return
    if (body.data != null) {
      useSettingStore().setSettingsFromRealtime(body.data)
      if (Array.isArray(body.data.stealCropBlacklist))
        useFriendStore().setBlacklistFromRealtime(body.data.stealCropBlacklist)
    }
  }

  function resetState() {
    status.value = null
    logs.value = []
    logFilterActive.value = false
    dailyGifts.value = null
  }

  ws.on('status:update', handleRealtimeStatus)
  ws.on('status:connection', handleStatusConnection)
  ws.on('status:profile', handleStatusProfile)
  ws.on('status:session', handleStatusSession)
  ws.on('status:operations', handleStatusOperations)
  ws.on('status:schedule', handleStatusSchedule)
  ws.on('log:new', handleRealtimeLog)
  ws.on('accounts:update', handleAccountsUpdate)
  ws.on('lands:update', handleLandsUpdate)
  ws.on('seeds:update', handleSeedsUpdate)
  ws.on('bag:update', handleBagUpdate)
  ws.on('daily-gifts:update', handleDailyGiftsUpdate)
  ws.on('friends:update', handleFriendsUpdate)
  ws.on('settings:update', handleSettingsUpdate)

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
})
