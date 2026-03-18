<script setup lang="ts">
import type { AnalyticsCropRow, AnalyticsSortKey } from '@/api/modules/analytics'
import { computed, ref, watch } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import { COLUMNS, HIGHLIGHT_COLOR_MAP } from '../constants'

const props = defineProps<{
  list: AnalyticsCropRow[]
  loading: boolean
  sortKey: AnalyticsSortKey
  searchQuery: string
  tableScrollY?: number
}>()

const imageErrors = ref<Record<string | number, boolean>>({})
const currentPage = ref(1)
const pageSize = ref(50)

const filteredList = computed(() => {
  const q = props.searchQuery.trim().toLowerCase()
  if (!q)
    return props.list
  return props.list.filter(
    item =>
      (item.name || '').toLowerCase().includes(q)
      || String(item.seedId || '').includes(q)
      || String(item.level || '').includes(q)
  )
})

const pagedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

watch(
  () => [props.searchQuery],
  () => {
    currentPage.value = 1
  }
)

function formatLv(level: number | string | null | undefined) {
  if (level === null || level === undefined || level === '' || Number(level) < 0)
    return '未知'
  return String(level)
}

function formatGrowTime(seconds: number | string | null | undefined) {
  const s = Number(seconds)
  if (!Number.isFinite(s) || s <= 0)
    return '0秒'
  if (s < 60)
    return `${s}秒`
  if (s < 3600) {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return secs > 0 ? `${mins}分${secs}秒` : `${mins}分`
  }
  const hours = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  return mins > 0 ? `${hours}时${mins}分` : `${hours}时`
}

function getHighlightColor(key: string): string {
  return HIGHLIGHT_COLOR_MAP[key] || 'var(--ant-color-text)'
}
</script>

<template>
  <div class="flex flex-1 flex-col min-h-0">
    <a-table
      :columns="COLUMNS"
      :data-source="pagedList"
      :loading="loading"
      :pagination="false"
      row-key="seedId"
      :scroll="{ x: 800, y: props.tableScrollY }"
      size="middle"
    >
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.key === 'rank'">
          <div v-if="(currentPage - 1) * pageSize + index < 3" class="flex items-center justify-center">
            <div
              class="text-xl"
              :class="[
                (currentPage - 1) * pageSize + index === 0 ? 'i-twemoji-1st-place-medal' : '',
                (currentPage - 1) * pageSize + index === 1 ? 'i-twemoji-2nd-place-medal' : '',
                (currentPage - 1) * pageSize + index === 2 ? 'i-twemoji-3rd-place-medal' : ''
              ]"
            />
          </div>
          <span v-else class="a-color-text-tertiary">{{ (currentPage - 1) * pageSize + index + 1 }}</span>
        </template>

        <template v-else-if="column.key === 'name'">
          <div class="flex gap-2.5 items-center">
            <div class="flex shrink-0 h-9 w-9 items-center justify-center overflow-hidden a-bg-layout rounded-lg">
              <img
                v-if="record.image && !imageErrors[record.seedId]"
                :src="record.image"
                class="h-7 w-7 object-contain"
                loading="lazy"
                @error="imageErrors[record.seedId] = true"
              >
              <div v-else class="i-streamline-emojis-seedling text-lg" />
            </div>
            <div class="flex flex-col gap-1.5 min-w-0">
              <div class="font-semibold a-color-text">
                {{ record.name }}
              </div>
              <div class="flex gap-1.5 items-center">
                <span class="px-1.5 py-px a-color-primary a-bg-primary-bg text-xs rounded">Lv{{ formatLv(record.level) }}</span>
                <span class="a-color-text-tertiary text-xs">{{ record.seasons }}季</span>
              </div>
            </div>
          </div>
        </template>

        <template v-else-if="column.key === 'growTime'">
          <span class="a-color-text">{{ formatGrowTime(record.growTime) }}</span>
        </template>

        <template v-else-if="column.key === 'expPerHour'">
          <span
            class="font-bold"
            :style="{ color: sortKey === 'exp' ? getHighlightColor('exp') : 'var(--ant-color-text)' }"
          >{{ record.expPerHour }}</span>
        </template>

        <template v-else-if="column.key === 'normalFertilizerExpPerHour'">
          <span
            class="font-bold"
            :style="{ color: sortKey === 'fert' ? getHighlightColor('fert') : 'var(--ant-color-text)' }"
          >{{ record.normalFertilizerExpPerHour ?? '-' }}</span>
        </template>

        <template v-else-if="column.key === 'profitPerHour'">
          <span
            class="font-bold"
            :style="{ color: sortKey === 'profit' ? getHighlightColor('profit') : 'var(--ant-color-text)' }"
          >{{ record.profitPerHour ?? '-' }}</span>
        </template>

        <template v-else-if="column.key === 'normalFertilizerProfitPerHour'">
          <span
            class="font-bold"
            :style="{
              color: sortKey === 'fert_profit' ? getHighlightColor('fert_profit') : 'var(--ant-color-text)'
            }"
          >{{ record.normalFertilizerProfitPerHour ?? '-' }}</span>
        </template>
      </template>

      <template #emptyText>
        <EmptyState
          icon="i-streamline-emojis-bar-chart text-4xl"
          :description="searchQuery ? '未找到匹配的作物' : '暂无数据'"
          class="py-4"
        />
      </template>
    </a-table>

    <!-- Pagination -->
    <div
      v-if="filteredList.length"
      class="px-4 py-3 border-t border-t-solid flex items-center justify-between a-border-t-border-sec"
    >
      <span class="a-color-text-tertiary">共 {{ filteredList.length }} 种作物</span>
      <a-pagination
        v-model:current="currentPage"
        v-model:page-size="pageSize"
        :total="filteredList.length"
        show-size-changer
        :page-size-options="['20', '50', '100']"
        show-quick-jumper
      />
    </div>
  </div>
</template>
