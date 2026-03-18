import type { AccountMutationPayload } from '@/api/modules/account'
import { defineStore } from 'pinia'
import { accountApi } from '@/api'

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

export const useAccountStore = defineStore('account', {
  state: () => ({
    accounts: [] as Account[],
    currentAccountId: ''
  }),
  getters: {
    currentAccount(): Account | undefined {
      return this.accounts.find(a => String(a.uin) === this.currentAccountId)
    }
  },
  actions: {
    resetDataStores() {
      const storeIds = ['status', 'bag', 'farm', 'friend', 'panel', 'analytics', 'strategy', 'behavior']
      this.$all.forEach((store) => {
        if (storeIds.includes(store.$id))
          store.$reset()
      })
    },
    selectAccount(id: string) {
      if (id !== this.currentAccountId) {
        this.resetDataStores()
        this.currentAccountId = id
      }
    },
    setCurrentAccount(acc: Account) {
      this.selectAccount(String(acc.uin))
    },
    async startAccount(uin: string) {
      if (!uin)
        throw new Error('账号标识为空，无法启动')
      await accountApi.start(uin)
    },
    async stopAccount(uin: string) {
      if (!uin)
        throw new Error('账号标识为空，无法停止')
      await accountApi.stop(uin)
    },
    async deleteAccount(ref: string) {
      if (!ref)
        throw new Error('账号标识为空，无法删除')
      await accountApi.remove(ref)
      if (this.currentAccountId === ref) {
        this.currentAccountId = ''
        this.resetDataStores()
      }
    },
    async addAccount(payload: AccountMutationPayload) {
      await accountApi.create(payload)
    },
    async updateAccount(uin: string, payload: AccountMutationPayload) {
      await accountApi.create({ ...payload, uin })
    },
    setAccountsFromRealtime(data: { accounts?: Account[] } | null | undefined) {
      if (data?.accounts && Array.isArray(data.accounts))
        this.accounts = data.accounts as Account[]
      if (!this.currentAccountId && this.accounts.length > 0)
        this.currentAccountId = String(this.accounts[0].uin ?? this.accounts[0].id ?? '')
    }
  },
  persist: {
    storage: localStorage
  }
})
