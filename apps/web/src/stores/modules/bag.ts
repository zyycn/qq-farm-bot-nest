import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { BAG_DASHBOARD_ITEM_IDS, BAG_HIDDEN_ITEM_IDS } from '../constants'

export const useBagStore = defineStore('bag', () => {
  const allItems = ref<any[]>([])
  const loading = ref(false)

  const items = computed(() => {
    return allItems.value.filter((it: any) => !BAG_HIDDEN_ITEM_IDS.has(Number(it.id || 0)))
  })

  const dashboardItems = computed(() => {
    return allItems.value.filter((it: any) => BAG_DASHBOARD_ITEM_IDS.has(Number(it.id || 0)))
  })

  async function fetchBag(_accountId: string) {
    // 背包数据仅通过 WebSocket bag:update 推送
  }

  function resetState() {
    allItems.value = []
  }

  function setBagFromRealtime(res: any) {
    if (res && Array.isArray(res.items))
      allItems.value = res.items
  }

  return { items, allItems, dashboardItems, loading, fetchBag, resetState, setBagFromRealtime }
})
