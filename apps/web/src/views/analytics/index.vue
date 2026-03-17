<script setup lang="ts">
import type { AnalyticsCropRow, AnalyticsSortKey } from '@/api/types'
import { useResizeObserver } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { analyticsApi } from '@/api'
import EmptyState from '@/components/EmptyState.vue'
import { useAccountRefresh } from '@/composables/useAccountRefresh'
import { useAccountStore, useAnalyticsStore } from '@/stores'
import CropTable from './components/CropTable.vue'
import SortToolbar from './components/SortToolbar.vue'
import StrategyPanel from './components/StrategyPanel.vue'
import { METRIC_MAP } from './constants'

const accountStore = useAccountStore()
const analyticsStore = useAnalyticsStore()
const { currentAccountId } = storeToRefs(accountStore)
const { list } = storeToRefs(analyticsStore)
const hasAccount = computed(() => !!currentAccountId.value)

const tableWrapperRef = ref<HTMLElement | null>(null)
const tableScrollY = ref<number | undefined>(undefined)

useResizeObserver(tableWrapperRef, (entries) => {
  const h = entries[0]?.contentRect.height
  if (h) {
    tableScrollY.value = Math.max(h - 105, 200)
  }
})

const loading = ref(false)
const sortKey = ref<AnalyticsSortKey>('exp')
const searchQuery = ref('')
const levelFilter = ref<number | null>(null)

const filteredList = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q)
    return list.value
  return list.value.filter(
    item =>
      (item.name || '').toLowerCase().includes(q)
      || String(item.seedId || '').includes(q)
      || String(item.level || '').includes(q)
  )
})

async function loadAnalytics() {
  if (!currentAccountId.value)
    return
  loading.value = true
  try {
    const res = await analyticsApi.get(sortKey.value)
    const data = Array.isArray(res) ? res : []
    if (data.length > 0) {
      list.value = data
      const metric = METRIC_MAP[sortKey.value]
      if (metric) {
        list.value.sort((a, b) => {
          const av = Number(a[metric as keyof AnalyticsCropRow])
          const bv = Number(b[metric as keyof AnalyticsCropRow])
          if (!Number.isFinite(av) && !Number.isFinite(bv))
            return 0
          if (!Number.isFinite(av))
            return 1
          if (!Number.isFinite(bv))
            return -1
          return bv - av
        })
      }
    } else {
      list.value = []
    }
  } catch (e) {
    console.error(e)
    list.value = []
  } finally {
    loading.value = false
  }
}

watch(sortKey, loadAnalytics)

useAccountRefresh(loadAnalytics)
</script>

<template>
  <div class="flex flex-col gap-3 h-full">
    <div class="font-bold flex gap-2 items-center a-color-text">
      <div class="i-streamline-emojis-bar-chart text-lg" />
      <span class="text-lg">数据分析</span>
    </div>

    <div v-if="!hasAccount" class="flex flex-1 items-center justify-center">
      <EmptyState icon="i-streamline-emojis-bar-chart text-5xl" description="请先在侧边栏选择账号" />
    </div>

    <a-card
      v-else
      variant="borderless"
      class="analytics-card flex-1 overflow-hidden"
      :classes="{ body: '!p-0 !h-full !flex !flex-col' }"
    >
      <StrategyPanel v-model:level-filter="levelFilter" :list="list" />
      <SortToolbar v-model:sort-key="sortKey" v-model:search-query="searchQuery" :total-count="filteredList.length" />

      <div ref="tableWrapperRef" class="flex-1 min-h-0">
        <CropTable
          :list="list"
          :loading="loading"
          :sort-key="sortKey"
          :search-query="searchQuery"
          :table-scroll-y="tableScrollY"
        />
      </div>
    </a-card>
  </div>
</template>
