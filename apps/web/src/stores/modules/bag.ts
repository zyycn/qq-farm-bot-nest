import type { BagItem } from '@/api/modules/inventory'
import { defineStore } from 'pinia'
import { BAG_DASHBOARD_ITEM_IDS, BAG_HIDDEN_ITEM_IDS } from '../constants'

export const useBagStore = defineStore('bag', {
  state: () => ({
    allItems: [] as BagItem[]
  }),
  getters: {
    items(): BagItem[] {
      return this.allItems.filter(it => !BAG_HIDDEN_ITEM_IDS.has(Number(it.id || 0)))
    },
    dashboardItems(): BagItem[] {
      return this.allItems.filter(it => BAG_DASHBOARD_ITEM_IDS.has(Number(it.id || 0)))
    }
  },
  actions: {
    setBagFromRealtime(res: { items?: BagItem[] } | null | undefined) {
      if (res && Array.isArray(res.items))
        this.allItems = res.items
    }
  },
  persist: {
    storage: localStorage
  }
})
