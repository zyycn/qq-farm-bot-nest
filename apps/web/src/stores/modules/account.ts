import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { accountApi } from '@/api'
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
  status?: {
    status?: { avatarUrl?: string, openId?: string }
  }
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
    accounts.value.find(a => String(a.id) === currentAccountId.value)
  )

  async function fetchAccounts() {
    loading.value = true
    try {
      // api interceptor adds Authorization header
      const res = await accountApi.fetchAccounts()
      if (res && res.accounts) {
        accounts.value = res.accounts as Account[]

        if (accounts.value.length > 0) {
          const found = accounts.value.find(a => String(a.id) === currentAccountId.value)
          if (!found && accounts.value[0]) {
            currentAccountId.value = String(accounts.value[0].id)
          }
        } else if (currentAccountId.value) {
          currentAccountId.value = ''
          useStatusStore().resetState()
          useBagStore().resetState()
          useFarmStore().resetState()
        }
      }
    } catch (e) {
      console.error('获取账号失败', e)
    } finally {
      loading.value = false
    }
  }

  function selectAccount(id: string) {
    currentAccountId.value = id
  }

  function setCurrentAccount(acc: Account) {
    selectAccount(acc.id)
  }

  async function startAccount(id: string) {
    await accountApi.startAccount(id)
    await fetchAccounts()
  }

  async function stopAccount(id: string) {
    await accountApi.stopAccount(id)
    await fetchAccounts()
  }

  async function deleteAccount(id: string) {
    await accountApi.deleteAccount(id)
    if (currentAccountId.value === id) {
      currentAccountId.value = ''
      useStatusStore().resetState()
      useBagStore().resetState()
      useFarmStore().resetState()
    }
    await fetchAccounts()
  }

  async function fetchLogs() {
    try {
      const res = await accountApi.fetchAccountLogs(100)
      logs.value = Array.isArray(res) ? res : []
    } catch (e) {
      console.error('获取账号日志失败', e)
    }
  }

  async function addAccount(payload: any) {
    try {
      await accountApi.saveAccount(payload)
      await fetchAccounts()
    } catch (e) {
      console.error('添加账号失败', e)
      throw e
    }
  }

  async function updateAccount(id: string, payload: any) {
    try {
      // core uses POST /api/accounts for both add and update (if id is present)
      await accountApi.saveAccount({ ...payload, id })
      await fetchAccounts()
    } catch (e) {
      console.error('更新账号失败', e)
      throw e
    }
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
    setCurrentAccount
  }
}, {
  persist: {
    pick: ['currentAccountId'],
    storage: localStorage
  }
})
