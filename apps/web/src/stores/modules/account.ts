import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ws } from '@/api'
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

export const useAccountStore = defineStore('account', () => {
  const accounts = ref<Account[]>([])
  const currentAccountId = ref('')

  const currentAccount = computed(() =>
    accounts.value.find(a => String(a.uin) === currentAccountId.value)
  )

  function selectAccount(id: string) {
    currentAccountId.value = id
  }

  function setCurrentAccount(acc: Account) {
    selectAccount(String(acc.uin))
  }

  async function startAccount(uin: string) {
    if (!uin)
      throw new Error('账号标识为空，无法启动')
    await ws.request('account:start', { id: uin })
  }

  async function stopAccount(uin: string) {
    if (!uin)
      throw new Error('账号标识为空，无法停止')
    await ws.request('account:stop', { id: uin })
  }

  async function deleteAccount(ref: string) {
    if (!ref)
      throw new Error('账号标识为空，无法删除')
    await ws.request('account:delete', { id: ref })
    if (currentAccountId.value === ref) {
      currentAccountId.value = ''
      useStatusStore().resetState()
      useBagStore().resetState()
      useFarmStore().resetState()
    }
  }

  async function addAccount(payload: any) {
    const res = await ws.request<{ accounts?: any[] }>('account:create', payload)
    if (res?.accounts && Array.isArray(res.accounts))
      accounts.value = res.accounts as Account[]
  }

  async function updateAccount(uin: string, payload: any) {
    const res = await ws.request<{ accounts?: any[] }>('account:create', { ...payload, uin })
    if (res?.accounts && Array.isArray(res.accounts))
      accounts.value = res.accounts as Account[]
  }

  function setAccountsFromRealtime(data: { accounts?: any[] }) {
    if (data?.accounts && Array.isArray(data.accounts))
      accounts.value = data.accounts as Account[]
  }

  return {
    accounts,
    currentAccountId,
    currentAccount,
    selectAccount,
    startAccount,
    stopAccount,
    deleteAccount,
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
