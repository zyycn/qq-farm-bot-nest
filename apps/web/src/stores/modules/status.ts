import type { Socket } from 'socket.io-client'
import { defineStore } from 'pinia'
import { io } from 'socket.io-client'
import { ref } from 'vue'
import { ACCOUNT_LOGS_MAX_LENGTH, LOGS_MAX_LENGTH, SOCKET_PATH } from '../constants'
import { useAccountStore } from './account'
import { useBagStore } from './bag'
import { useFarmStore } from './farm'
import { useFriendStore } from './friend'
import { useSettingStore } from './setting'
import { useUserStore } from './user'

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
  const accountLogs = ref<any[]>([])
  const dailyGifts = ref<DailyGiftsResponse | null>(null)
  const loading = ref(false)
  const error = ref('')
  const realtimeConnected = ref(false)
  const realtimeLogsEnabled = ref(true)
  const currentRealtimeAccountId = ref('')
  const subscribedResolvedAccountId = ref('')

  let socket: Socket | null = null

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
    const next = normalizeLogEntry(entry)
    logs.value.push(next)
    if (logs.value.length > LOGS_MAX_LENGTH)
      logs.value = logs.value.slice(-LOGS_MAX_LENGTH)
  }

  function pushRealtimeAccountLog(entry: any) {
    const next = (entry && typeof entry === 'object') ? entry : {}
    accountLogs.value.push(next)
    if (accountLogs.value.length > ACCOUNT_LOGS_MAX_LENGTH)
      accountLogs.value = accountLogs.value.slice(-ACCOUNT_LOGS_MAX_LENGTH)
  }

  function handleRealtimeStatus(payload: any) {
    const body = (payload && typeof payload === 'object') ? payload : {}
    const incomingId = String(body.accountId || '').trim()
    const resolvedId = subscribedResolvedAccountId.value
    if (resolvedId && incomingId && incomingId !== resolvedId)
      return
    if (body.status && typeof body.status === 'object') {
      status.value = normalizeStatusPayload(body.status)
      error.value = ''
    } else {
      status.value = null
    }
  }

  function handleRealtimeLog(payload: any) {
    if (!realtimeLogsEnabled.value)
      return
    pushRealtimeLog(payload)
  }

  function handleRealtimeAccountLog(payload: any) {
    pushRealtimeAccountLog(payload)
  }

  function handleRealtimeLogsSnapshot(payload: any) {
    const body = (payload && typeof payload === 'object') ? payload : {}
    const list = Array.isArray(body.logs) ? body.logs : []
    logs.value = list.map((item: any) => normalizeLogEntry(item))
  }

  function handleRealtimeAccountLogsSnapshot(payload: any) {
    const body = (payload && typeof payload === 'object') ? payload : {}
    const list = Array.isArray(body.logs) ? body.logs : []
    accountLogs.value = list
  }

  function handleAccountsUpdate(payload: any) {
    const data = payload && typeof payload === 'object' ? payload : {}
    useAccountStore().setAccountsFromRealtime(data)
  }

  function handleLandsUpdate(payload: any) {
    const body = payload && typeof payload === 'object' ? payload : {}
    const accountId = String(body.accountId || '').trim()
    if (accountId && subscribedResolvedAccountId.value && accountId !== subscribedResolvedAccountId.value)
      return
    if (body.data != null)
      useFarmStore().setLandsFromRealtime(body.data)
  }

  function handleSeedsUpdate(payload: any) {
    const body = payload && typeof payload === 'object' ? payload : {}
    const accountId = String(body.accountId || '').trim()
    if (accountId && subscribedResolvedAccountId.value && accountId !== subscribedResolvedAccountId.value)
      return
    if (body.data != null)
      useFarmStore().setSeedsFromRealtime(Array.isArray(body.data) ? body.data : [])
  }

  function handleBagUpdate(payload: any) {
    const body = payload && typeof payload === 'object' ? payload : {}
    const accountId = String(body.accountId || '').trim()
    if (accountId && subscribedResolvedAccountId.value && accountId !== subscribedResolvedAccountId.value)
      return
    if (body.data != null)
      useBagStore().setBagFromRealtime(body.data)
  }

  function handleDailyGiftsUpdate(payload: any) {
    const body = payload && typeof payload === 'object' ? payload : {}
    const accountId = String(body.accountId || '').trim()
    if (accountId && subscribedResolvedAccountId.value && accountId !== subscribedResolvedAccountId.value)
      return
    if (body.data != null)
      dailyGifts.value = body.data
  }

  function handleFriendsUpdate(payload: any) {
    const body = payload && typeof payload === 'object' ? payload : {}
    const accountId = String(body.accountId || '').trim()
    if (accountId && subscribedResolvedAccountId.value && accountId !== subscribedResolvedAccountId.value)
      return
    if (body.data != null)
      useFriendStore().setFriendsFromRealtime(Array.isArray(body.data) ? body.data : [])
  }

  function handleSettingsUpdate(payload: any) {
    const body = payload && typeof payload === 'object' ? payload : {}
    const accountId = String(body.accountId || '').trim()
    if (accountId && subscribedResolvedAccountId.value && accountId !== subscribedResolvedAccountId.value)
      return
    if (body.data != null) {
      useSettingStore().setSettingsFromRealtime(body.data)
      if (Array.isArray(body.data.stealCropBlacklist))
        useFriendStore().setBlacklistFromRealtime(body.data.stealCropBlacklist)
    }
  }

  function ensureRealtimeSocket() {
    if (socket)
      return socket

    const token = useUserStore().adminToken

    socket = io('/', {
      path: SOCKET_PATH,
      autoConnect: false,
      transports: ['websocket'],
      auth: {
        token
      }
    })

    socket.on('connect', () => {
      realtimeConnected.value = true
      if (currentRealtimeAccountId.value) {
        socket?.emit('subscribe', { accountId: currentRealtimeAccountId.value })
      } else {
        socket?.emit('subscribe', { accountId: 'all' })
      }
    })

    socket.on('disconnect', () => {
      realtimeConnected.value = false
    })

    socket.on('connect_error', (err) => {
      realtimeConnected.value = false
      console.error('[realtime] 连接失败:', err.message)
    })

    function handleSubscribed(payload: any) {
      const id = (payload && typeof payload === 'object' && payload.accountId === 'all') ? '' : String((payload && payload.accountId) || '').trim()
      subscribedResolvedAccountId.value = id
    }
    socket.on('subscribed', handleSubscribed)

    socket.on('status:update', handleRealtimeStatus)
    socket.on('log:new', handleRealtimeLog)
    socket.on('account-log:new', handleRealtimeAccountLog)
    socket.on('logs:snapshot', handleRealtimeLogsSnapshot)
    socket.on('account-logs:snapshot', handleRealtimeAccountLogsSnapshot)
    socket.on('accounts:update', handleAccountsUpdate)
    socket.on('lands:update', handleLandsUpdate)
    socket.on('seeds:update', handleSeedsUpdate)
    socket.on('bag:update', handleBagUpdate)
    socket.on('daily-gifts:update', handleDailyGiftsUpdate)
    socket.on('friends:update', handleFriendsUpdate)
    socket.on('settings:update', handleSettingsUpdate)
    return socket
  }

  function connectRealtime(accountId: string) {
    const id = String(accountId || '').trim()
    if (!id)
      return
    if (currentRealtimeAccountId.value && currentRealtimeAccountId.value !== id)
      resetState()
    currentRealtimeAccountId.value = id
    subscribedResolvedAccountId.value = ''
    const token = useUserStore().adminToken
    if (!token)
      return

    const client = ensureRealtimeSocket()
    client.auth = {
      token,
      accountId: currentRealtimeAccountId.value
    }

    if (client.connected) {
      client.emit('subscribe', { accountId: currentRealtimeAccountId.value })
      return
    }
    client.connect()
  }

  function disconnectRealtime() {
    if (!socket)
      return
    socket.off('connect')
    socket.off('disconnect')
    socket.off('connect_error')
    socket.off('subscribed')
    socket.off('status:update', handleRealtimeStatus)
    socket.off('log:new', handleRealtimeLog)
    socket.off('account-log:new', handleRealtimeAccountLog)
    socket.off('logs:snapshot', handleRealtimeLogsSnapshot)
    socket.off('account-logs:snapshot', handleRealtimeAccountLogsSnapshot)
    socket.off('accounts:update', handleAccountsUpdate)
    socket.off('lands:update', handleLandsUpdate)
    socket.off('seeds:update', handleSeedsUpdate)
    socket.off('bag:update', handleBagUpdate)
    socket.off('daily-gifts:update', handleDailyGiftsUpdate)
    socket.off('friends:update', handleFriendsUpdate)
    socket.off('settings:update', handleSettingsUpdate)
    socket.disconnect()
    socket = null
    realtimeConnected.value = false
  }

  async function fetchStatus(_accountId: string) {
    // 数据仅通过 WebSocket 推送，无 HTTP 回退
  }

  async function fetchLogs(_accountId: string, _options: any = {}) {
    // 数据仅通过 WebSocket 推送
  }

  async function fetchDailyGifts(_accountId: string) {
    // 数据仅通过 WebSocket 推送
  }

  async function fetchAccountLogs(_limit = 100) {
    // 数据仅通过 WebSocket 推送
  }

  function setRealtimeLogsEnabled(enabled: boolean) {
    realtimeLogsEnabled.value = !!enabled
  }

  function wsRequest<T = any>(event: string, payload: any): Promise<T> {
    const s = socket
    if (!s || !s.connected)
      return Promise.reject(new Error('WebSocket 未连接'))
    return new Promise((resolve, reject) => {
      s.emit(event, payload ?? {}, (response: any) => {
        if (response && response.status === 'ok')
          resolve(response.data as T)
        else
          reject(new Error(response?.message || '请求失败'))
      })
    })
  }

  function resetState() {
    status.value = null
    logs.value = []
    accountLogs.value = []
    dailyGifts.value = null
  }

  return {
    status,
    logs,
    accountLogs,
    dailyGifts,
    loading,
    error,
    realtimeConnected,
    realtimeLogsEnabled,
    fetchStatus,
    fetchLogs,
    fetchAccountLogs,
    fetchDailyGifts,
    setRealtimeLogsEnabled,
    resetState,
    connectRealtime,
    disconnectRealtime,
    wsRequest
  }
})
