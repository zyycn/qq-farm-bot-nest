import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useBagStore } from './bag'
import { useFarmStore } from './farm'
import { useStatusStore } from './status'

export interface Account {
  id: string
  name: string
  nick?: string
  uin?: number | string
  platform?: string
  running?: boolean
  avatar?: string
  connected?: boolean
  // Add other fields as discovered
}

export interface AccountLog {
  time: string
  action: string
  msg: string
  reason?: string
}

export function getPlatformIcon(p?: string) {
  if (p === 'qq')
    return 'i-icon-park-solid-tencent-qq'
  if (p === 'wx')
    return 'i-icon-park-solid-wechat'
  return ''
}

export const useAccountStore = defineStore('account', () => {
  const accounts = ref<Account[]>([])
  const currentAccountId = ref('')
  const loading = ref(false)
  const logs = ref<AccountLog[]>([])

  const currentAccount = computed(() =>
    accounts.value.find(a => String(a.uin) === currentAccountId.value)
  )

  async function fetchAccounts() {
    // 账号列表仅通过 WebSocket accounts:update 推送，无 HTTP 回退
  }

  function selectAccount(id: string) {
    currentAccountId.value = id
  }

  function setCurrentAccount(acc: Account) {
    selectAccount(String(acc.uin))
  }

  async function startAccount(uin: string) {
    if (!uin)
      throw new Error('账号标识为空，无法启动')
    const statusStore = useStatusStore()
    await statusStore.wsRequest('account:start', { id: uin })
  }

  async function stopAccount(uin: string) {
    if (!uin)
      throw new Error('账号标识为空，无法停止')
    const statusStore = useStatusStore()
    await statusStore.wsRequest('account:stop', { id: uin })
  }

  async function deleteAccount(ref: string) {
    if (!ref)
      throw new Error('账号标识为空，无法删除')
    const statusStore = useStatusStore()
    await statusStore.wsRequest('account:delete', { id: ref })
    if (currentAccountId.value === ref) {
      currentAccountId.value = ''
      useStatusStore().resetState()
      useBagStore().resetState()
      useFarmStore().resetState()
    }
  }

  async function fetchLogs() {
    // 账号日志仅通过 WebSocket account-logs:snapshot / account-log:new 推送
  }

  async function addAccount(payload: any) {
    const statusStore = useStatusStore()
    await statusStore.wsRequest('account:create', payload)
  }

  async function updateAccount(uin: string, payload: any) {
    const statusStore = useStatusStore()
    await statusStore.wsRequest('account:create', { ...payload, uin })
  }

  function setAccountsFromRealtime(data: { accounts?: any[] }) {
    if (data?.accounts && Array.isArray(data.accounts))
      accounts.value = data.accounts as Account[]
  }

  return {
    accounts,
    currentAccountId,
    currentAccount,
    loading,
    logs,
    fetchAccounts,
    selectAccount,
    startAccount,
    stopAccount,
    deleteAccount,
    fetchLogs,
    addAccount,
    updateAccount,
    setCurrentAccount,
    setAccountsFromRealtime
  }
}, {
  persist: {
    pick: ['currentAccountId'],
    storage: localStorage
  }
})
