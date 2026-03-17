import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', {
  state: () => ({
    adminToken: ''
  }),
  actions: {
    setToken(token: string) {
      this.adminToken = token
    },
    clearToken() {
      this.adminToken = ''
    }
  },
  persist: {
    storage: localStorage
  }
})
