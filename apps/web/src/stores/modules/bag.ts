import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { bagApi } from '@/api'
import { BAG_DASHBOARD_ITEM_IDS, BAG_HIDDEN_ITEM_IDS } from '../constants'

export const useBagStore = defineStore('bag', () => {
  const allItems = ref<any[]>([])

  const items = computed(() => {
    return allItems.value.filter((it: any) => !BAG_HIDDEN_ITEM_IDS.has(Number(it.id || 0)))
  })

  const dashboardItems = computed(() => {
    return allItems.value.filter((it: any) => BAG_DASHBOARD_ITEM_IDS.has(Number(it.id || 0)))
  })

  function resetState(): void {
    allItems.value = []
  }

  function setBagFromRealtime(res: any): void {
    if (res && Array.isArray(res.items))
      allItems.value = res.items
  }

  bagApi.onBagUpdate((data: any) => {
    if (data != null)
      setBagFromRealtime(data)
  })

  return { items, allItems, dashboardItems, resetState, setBagFromRealtime }
}, {
  persist: {
    storage: sessionStorage
  }
})
