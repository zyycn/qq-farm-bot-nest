import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAnalyticsStore = defineStore('analytics', () => {
  const list = ref<any[]>([])

  return {
    list
  }
}, {
  persist: {
    storage: sessionStorage
  }
})
