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
  connected?: boolean
}

export const useAccountStore = defineStore('account', () => {
  const accounts = ref<Account[]>([])
  const currentAccountId = ref('')

  const currentAccount = computed(() =>
    accounts.value.find(a => String(a.uin) === currentAccountId.value)
  )

  function selectAccount(id: string): void {
    currentAccountId.value = id
  }

  function setCurrentAccount(acc: Account): void {
    selectAccount(String(acc.uin))
  }

  async function startAccount(uin: string): Promise<void> {
    if (!uin)
      throw new Error('账号标识为空，无法启动')
    await accountApi.start(uin)
  }

  async function stopAccount(uin: string): Promise<void> {
    if (!uin)
      throw new Error('账号标识为空，无法停止')
    await accountApi.stop(uin)
  }

  async function deleteAccount(ref: string): Promise<void> {
    if (!ref)
      throw new Error('账号标识为空，无法删除')
    await accountApi.remove(ref)
    if (currentAccountId.value === ref) {
      currentAccountId.value = ''
      useStatusStore().resetState()
      useBagStore().resetState()
      useFarmStore().resetState()
    }
  }

  async function addAccount(payload: any): Promise<void> {
    const res = await accountApi.create(payload)
    if (res?.accounts && Array.isArray(res.accounts))
      accounts.value = res.accounts as Account[]
  }

  async function updateAccount(uin: string, payload: any): Promise<void> {
    const res = await accountApi.create({ ...payload, uin })
    if (res?.accounts && Array.isArray(res.accounts))
      accounts.value = res.accounts as Account[]
  }

  function setAccountsFromRealtime(data: any): void {
    if (data?.accounts && Array.isArray(data.accounts))
      accounts.value = data.accounts as Account[]
    if (!currentAccountId.value && accounts.value.length > 0)
      currentAccountId.value = String(accounts.value[0].uin ?? accounts.value[0].id ?? '')
  }

  accountApi.onAccountsUpdate((data: any) => {
    const payload = data && typeof data === 'object' ? data : {}
    setAccountsFromRealtime(payload)
  })

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
    storage: sessionStorage
  }
})
