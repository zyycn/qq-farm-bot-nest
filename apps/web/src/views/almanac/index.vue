<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { almanacApi } from '@/api'
import type { AlmanacItem, AlmanacOverview, AlmanacSummary } from '@/api/modules/almanac'
import EmptyState from '@/components/EmptyState.vue'
import { useAccountRefresh } from '@/composables/useAccountRefresh'
import { useImageFallback } from '@/composables/useImageFallback'
import { useWs } from '@/composables/useWs'
import { useAccountStore } from '@/stores'
import message from '@/utils/message'
import type { AlmanacCategoryFilter, AlmanacStatusFilter } from './constants'
import AlmanacDetailModal from './components/AlmanacDetailModal.vue'
import AlmanacFilters from './components/AlmanacFilters.vue'
import AlmanacItemCard from './components/AlmanacItemCard.vue'
import AlmanacSummaryCard from './components/AlmanacSummaryCard.vue'

const DEFAULT_SUMMARY: AlmanacSummary = {
  level: 0,
  exp: 0,
  nextLevelExp: 0,
  progressPercent: 0,
  rewardFlag: 0,
  rewardBoxVisible: false,
  rewardBoxEnabled: false,
  rewardBoxRedDot: false,
  rewardBoxClaimable: false,
  rewardBoxClaimableRaw: false,
  rewardBoxPreview: null,
  litCount: 0,
  newCount: 0,
  totalCount: 0,
  categoryCounts: {
    normal: 0,
    treasure: 0,
    unknown: 0
  }
}

const accountStore = useAccountStore()
const { currentAccountId } = storeToRefs(accountStore)
const { onImageError, hasImageError, resetImageErrors } = useImageFallback()

const loading = ref(false)
const claiming = ref(false)
const items = ref<AlmanacItem[]>([])
const summary = ref<AlmanacSummary | null>(null)
const categoryFilter = ref<AlmanacCategoryFilter>('all')
const statusFilter = ref<AlmanacStatusFilter>('all')
const searchQuery = ref('')
const selectedItem = ref<AlmanacItem | null>(null)

const hasAccount = computed(() => !!currentAccountId.value)
const summaryModel = computed(() => summary.value ?? DEFAULT_SUMMARY)

const categoryCounts = computed<Record<AlmanacCategoryFilter, number>>(() => ({
  all: items.value.length,
  normal: summaryModel.value.categoryCounts.normal,
  treasure: summaryModel.value.categoryCounts.treasure,
  unknown: summaryModel.value.categoryCounts.unknown
}))

const statusCounts = computed<Record<AlmanacStatusFilter, number>>(() => ({
  all: items.value.length,
  lit: items.value.filter(item => item.lit).length,
  new: items.value.filter(item => item.isNew).length,
  unlit: items.value.filter(item => !item.lit).length
}))

const filteredItems = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return items.value.filter((item) => {
    if (categoryFilter.value !== 'all' && item.category !== categoryFilter.value)
      return false

    if (statusFilter.value === 'lit' && !item.lit)
      return false

    if (statusFilter.value === 'new' && !item.isNew)
      return false

    if (statusFilter.value === 'unlit' && item.lit)
      return false

    if (!query)
      return true

    const haystack = [
      item.name,
      item.qualityLabel,
      item.rarityLabel,
      item.categoryLabel,
      item.statusLabel,
      ...item.sourceLabels
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  })
})

let loadToken = 0

function getItemKey(item: Pick<AlmanacItem, 'fruitId' | 'seedId' | 'plantId' | 'name'>): string {
  return String(item.fruitId || item.seedId || item.plantId || item.name)
}

function syncSelectedItem(nextItems: AlmanacItem[]): void {
  if (!selectedItem.value)
    return

  const currentKey = getItemKey(selectedItem.value)
  selectedItem.value = nextItems.find(item => getItemKey(item) === currentKey) ?? null
}

function applyAlmanacOverview(overview: Partial<AlmanacOverview> | null | undefined): void {
  summary.value = overview?.summary ?? DEFAULT_SUMMARY
  items.value = Array.isArray(overview?.items) ? overview.items : []
  syncSelectedItem(items.value)
  resetImageErrors()
}

async function loadAlmanac(refresh = false): Promise<void> {
  const currentLoadToken = ++loadToken

  if (!currentAccountId.value) {
    summary.value = null
    items.value = []
    selectedItem.value = null
    return
  }

  loading.value = true

  try {
    const response = await almanacApi.query(refresh)
    if (currentLoadToken !== loadToken)
      return

    applyAlmanacOverview(response)
  } catch (error: unknown) {
    if (currentLoadToken !== loadToken)
      return

    summary.value = DEFAULT_SUMMARY
    items.value = []
    selectedItem.value = null
    const err = error as { message?: string }
    message.error(err?.message || '加载图鉴数据失败')
  } finally {
    if (currentLoadToken === loadToken)
      loading.value = false
  }
}

async function refreshAlmanac(): Promise<void> {
  await loadAlmanac(true)
}

async function claimRewards(): Promise<void> {
  if (claiming.value || !summaryModel.value.rewardBoxClaimable)
    return

  claiming.value = true
  try {
    const result = await almanacApi.claimRewards()
    const rewardCount = (result?.items?.length ?? 0) + (result?.bonusItems?.length ?? 0)

    if (rewardCount > 0)
      message.success(result?.summaryText || '已领取图鉴宝箱')
    else
      message.info(result?.summaryText || '当前没有可领取的图鉴宝箱')

    await loadAlmanac(true)
  } catch (error: unknown) {
    const err = error as { message?: string }
    message.error(err?.message || '领取图鉴宝箱失败')
  } finally {
    claiming.value = false
  }
}

function openItemDetail(item: AlmanacItem): void {
  selectedItem.value = item
}

function closeItemDetail(): void {
  selectedItem.value = null
}

useAccountRefresh(() => loadAlmanac(true))

useWs()
  .sub('almanac')
  .on('almanac.update', (payload) => {
    applyAlmanacOverview(payload as Partial<AlmanacOverview>)
  })
</script>

<template>
  <div class="flex h-full flex-col gap-3">
    <div class="flex items-center gap-2 font-bold a-color-text">
      <div class="i-streamline-emojis-open-book text-lg" />
      <span class="text-lg">我的图鉴</span>
    </div>

    <div v-if="!hasAccount" class="flex flex-1 items-center justify-center">
      <EmptyState icon="i-streamline-emojis-open-book text-5xl" description="请先在侧边栏选择账号" />
    </div>

    <template v-else>
      <AlmanacSummaryCard
        :summary="summaryModel"
        :loading="loading"
        :claiming="claiming"
        @refresh="refreshAlmanac"
        @claim="claimRewards"
      />

      <a-card
        variant="borderless"
        class="flex-1 overflow-hidden"
        :classes="{ body: '!p-0 !h-full !flex !flex-col' }"
      >
        <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
          <AlmanacFilters
            v-model:category="categoryFilter"
            v-model:status="statusFilter"
            v-model:search-query="searchQuery"
            :total-count="items.length"
            :filtered-count="filteredItems.length"
            :category-counts="categoryCounts"
            :status-counts="statusCounts"
          />

          <div class="min-h-0 flex-1 overflow-y-auto">
            <div v-if="loading && !items.length" class="flex h-full items-center justify-center">
              <a-spin />
            </div>
            <div v-else-if="!items.length" class="flex h-full items-center justify-center">
              <EmptyState icon="i-streamline-emojis-seedling text-3xl" description="当前账号暂无图鉴数据" />
            </div>
            <div v-else-if="!filteredItems.length" class="flex h-full items-center justify-center">
              <EmptyState icon="i-streamline-emojis-magnifying-glass-tilted-left text-3xl" description="没有符合当前筛选条件的图鉴条目" />
            </div>
            <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
              <AlmanacItemCard
                v-for="item in filteredItems"
                :key="getItemKey(item)"
                :item="item"
                :image-error="hasImageError(getItemKey(item))"
                @select="openItemDetail(item)"
                @image-error="onImageError(getItemKey(item))"
              />
            </div>
          </div>
        </div>
      </a-card>
    </template>

    <AlmanacDetailModal
      :open="!!selectedItem"
      :item="selectedItem"
      :image-error="selectedItem ? hasImageError(getItemKey(selectedItem)) : false"
      @cancel="closeItemDetail"
      @image-error="selectedItem && onImageError(getItemKey(selectedItem))"
    />
  </div>
</template>
