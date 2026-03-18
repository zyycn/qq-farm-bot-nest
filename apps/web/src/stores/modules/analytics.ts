import type { AnalyticsCropRow } from '@/api/modules/analytics'
import { defineStore } from 'pinia'

export const useAnalyticsStore = defineStore('analytics', {
  state: () => ({
    list: [] as AnalyticsCropRow[],
    strategyPanelCollapsed: false
  }),
  actions: {
    setStrategyPanelCollapsed(value: boolean) {
      this.strategyPanelCollapsed = value
    },
    toggleStrategyPanelCollapsed() {
      this.strategyPanelCollapsed = !this.strategyPanelCollapsed
    }
  },
  persist: {
    storage: localStorage
  }
})
