<script setup lang="ts">
import type { AlmanacItem, AlmanacOverview, AlmanacSummary } from '@/api/modules/almanac'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { almanacApi } from '@/api'
import EmptyState from '@/components/EmptyState.vue'
import { useAccountRefresh } from '@/composables/useAccountRefresh'
import { useImageFallback } from '@/composables/useImageFallback'
import { useWs } from '@/composables/useWs'
import { useAccountStore } from '@/stores'
import message from '@/utils/message'
import AlmanacCard from './components/AlmanacCard.vue'
import AlmanacDetailModal from './components/AlmanacDetailModal.vue'
import { DEFAULT_SUMMARY } from './constants'

const accountStore = useAccountStore()
const { currentAccountId } = storeToRefs(accountStore)
const currentAccount = computed(() => accountStore.currentAccount)
const accountRunning = computed(() => !!currentAccount.value?.running)
const { hasImageError, onImageError, resetImageErrors } = useImageFallback()

const loading = ref(false)
const claiming = ref(false)
const items = ref<AlmanacItem[]>([])
const summary = ref<AlmanacSummary | null>(null)
const searchQuery = ref('')
const selectedPlant = ref<AlmanacItem | null>(null)
const detailVisible = ref(false)

const hasAccount = computed(() => !!currentAccountId.value)
const summaryModel = computed(() => summary.value ?? DEFAULT_SUMMARY)
const almanacLevel = computed(() => summaryModel.value.level)
const almanacProgress = computed(() => summaryModel.value.exp)
const almanacTotalProgress = computed(() => Math.max(summaryModel.value.exp, summaryModel.value.nextLevelExp || 0))
const unlockedCount = computed(() => summaryModel.value.litCount)
const totalCount = computed(() => items.value.length)
const progressPercent = computed(() => {
  const need = almanacTotalProgress.value
  if (need <= 0)
    return 0
  return Math.min(100, Math.round((almanacProgress.value / need) * 100))
})

const filteredList = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q)
    return items.value
  return items.value.filter(
    item =>
      (item.name || '').toLowerCase().includes(q)
      || String(item.seedId || '').includes(q)
  )
})

function getItemKey(item: AlmanacItem): string {
  return String(item.fruitId || item.seedId || item.plantId || item.name)
}

function syncSelectedItem(nextItems: AlmanacItem[]): void {
  if (!selectedPlant.value)
    return
  const key = getItemKey(selectedPlant.value)
  selectedPlant.value = nextItems.find(item => getItemKey(item) === key) ?? null
}

function applyAlmanacOverview(overview: AlmanacOverview | null | undefined): void {
  summary.value = overview?.summary ?? DEFAULT_SUMMARY
  items.value = Array.isArray(overview?.items) ? overview.items : []
  syncSelectedItem(items.value)
  resetImageErrors()
}

async function loadPlants(): Promise<void> {
  if (!currentAccountId.value) {
    summary.value = null
    items.value = []
    selectedPlant.value = null
    return
  }
  loading.value = true
  try {
    const data = await almanacApi.query(true)
    applyAlmanacOverview(data)
  } catch (e) {
    summary.value = DEFAULT_SUMMARY
    items.value = []
    selectedPlant.value = null
    message.error((e as Error)?.message || '加载图鉴失败')
  } finally {
    loading.value = false
  }
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
    await loadPlants()
  } catch (e) {
    message.error((e as Error)?.message || '领取图鉴宝箱失败')
  } finally {
    claiming.value = false
  }
}

function openDetail(plant: AlmanacItem): void {
  selectedPlant.value = plant
  detailVisible.value = true
}

useAccountRefresh(loadPlants)

useWs()
  .sub('almanac')
  .on('almanac.update', applyAlmanacOverview)
</script>

<template>
  <div class="flex flex-col gap-3 h-full">
    <div class="font-bold flex gap-2 items-center a-color-text">
      <div class="i-streamline-emojis-open-book text-green-6 text-xl" />
      <span class="text-lg">我的图鉴</span>
    </div>

    <div
      v-if="!hasAccount"
      class="flex flex-1 min-h-0 items-center justify-center"
    >
      <EmptyState icon="i-streamline-emojis-open-book text-5xl" description="请先在侧边栏选择账号" />
    </div>

    <div
      v-else-if="!accountRunning"
      class="flex flex-1 min-h-0 items-center justify-center"
    >
      <EmptyState icon="i-streamline-emojis-electric-plug text-5xl" description="账号未运行，请先启动账号" />
    </div>

    <a-card
      v-else
      variant="borderless"
      class="flex-1 overflow-hidden rounded-2xl"
      :classes="{ body: '!p-0 !h-full !flex !flex-col' }"
    >
      <header class="px-3 py-3 border-b flex flex-col gap-3 min-w-0 overflow-hidden a-border-b-border-sec sm:px-4 sm:py-3 sm:flex-row sm:gap-4 sm:items-start">
        <!-- 左侧：状态 pills + 经验进度 + 六格统计 -->
        <div class="flex flex-1 flex-col gap-3 min-w-0">
          <div class="flex flex-wrap gap-2 min-w-0 items-center" role="group">
            <span class="px-2 py-1 flex shrink-0 gap-1 items-center a-bg-layout text-xs rounded-md">
              <span class="text-amber-5 i-streamline-emojis-sparkles shrink-0 text-sm" />
              <span class="a-color-text-secondary">等级</span>
              <span class="font-medium tabular-nums a-color-text">{{ almanacLevel }}</span>
            </span>
            <span class="px-2 py-1 flex shrink-0 gap-1 items-center a-bg-layout text-xs rounded-md">
              <span class="i-streamline-emojis-four-leaf-clover text-green-5 shrink-0 text-sm" />
              <span class="a-color-text-secondary">已点亮</span>
              <span class="font-medium tabular-nums a-color-text">{{ unlockedCount }}/{{ totalCount }}</span>
            </span>
            <span class="px-2 py-1 flex shrink-0 gap-1 items-center a-bg-layout text-xs rounded-md">
              <span class="i-streamline-emojis-package shrink-0 a-color-text-secondary text-sm" />
              <span class="a-color-text-secondary">新解锁</span>
              <span class="font-medium tabular-nums a-color-text">{{ summaryModel.newCount }}</span>
            </span>
            <a-button
              v-if="summaryModel.rewardBoxVisible"
              size="small"
              type="primary"
              :loading="claiming"
              :disabled="!summaryModel.rewardBoxClaimable"
              @click="claimRewards"
            >
              <span class="i-streamline-emojis-wrapped-gift-1" />
              <span>领取</span>
            </a-button>
          </div>
          <div class="mt-1 flex flex-col gap-2.5 min-w-0">
            <div class="flex gap-2 items-baseline justify-between">
              <span class="a-color-text-secondary text-xs">图鉴经验</span>
              <span class="shrink-0 tabular-nums a-color-text-tertiary text-xs">{{ almanacProgress }} / {{ almanacTotalProgress }}</span>
            </div>
            <a-progress
              :percent="progressPercent"
              :show-info="false"
              size="small"
              stroke-color="var(--ant-color-success)"
              class="min-w-0"
            />
          </div>
        </div>

        <!-- 右侧：操作按钮 + 搜索 -->
        <div class="flex flex-1 flex-col gap-3">
          <div class="gap-2 grid grid-cols-3 min-w-0 sm:grid-cols-5">
            <div class="px-2 py-1.5 flex flex-col gap-0.5 items-center justify-center a-bg-layout rounded-md" role="group">
              <span class="text-[10px] a-color-text-tertiary">普通</span>
              <span class="font-medium tabular-nums a-color-text text-xs">{{ summaryModel.categoryCounts.normal }}</span>
            </div>
            <div class="px-2 py-1.5 flex flex-col gap-0.5 items-center justify-center a-bg-layout rounded-md" role="group">
              <span class="text-[10px] a-color-text-tertiary">珍藏</span>
              <span class="font-medium tabular-nums a-color-text text-xs">{{ summaryModel.categoryCounts.treasure }}</span>
            </div>
            <div class="px-2 py-1.5 flex flex-col gap-0.5 items-center justify-center a-bg-layout rounded-md" role="group">
              <span class="text-[10px] a-color-text-tertiary">其他</span>
              <span class="font-medium tabular-nums a-color-text text-xs">{{ summaryModel.categoryCounts.unknown }}</span>
            </div>
            <div class="px-2 py-1.5 flex flex-col gap-0.5 items-center justify-center a-bg-layout rounded-md" role="group">
              <span class="text-[10px] a-color-text-tertiary">已亮</span>
              <span class="font-medium tabular-nums a-color-text text-xs">{{ summaryModel.litCount }}</span>
            </div>
            <div class="px-2 py-1.5 flex flex-col gap-0.5 items-center justify-center a-bg-layout rounded-md" role="group">
              <span class="text-[10px] a-color-text-tertiary">新品</span>
              <span class="font-medium tabular-nums a-color-text text-xs">{{ summaryModel.newCount }}</span>
            </div>
          </div>
          <div class="flex gap-1.5">
            <a-input
              v-model:value="searchQuery"
              placeholder="搜索作物名称或 ID…"
              allow-clear
              size="small"
              class="min-w-0 w-full"
            >
              <template #prefix>
                <span class="i-streamline-emojis-magnifying-glass-tilted-left a-color-text-tertiary" />
              </template>
            </a-input>
            <a-button size="small" variant="filled" color="primary" :loading="loading" @click="loadPlants">
              刷新
            </a-button>
          </div>
        </div>
      </header>

      <div class="p-4 flex flex-1 flex-col min-h-0 min-w-0 overflow-y-auto">
        <a-spin :spinning="loading" class="flex flex-1 flex-col min-h-0 min-w-0">
          <div v-if="filteredList.length === 0" class="flex h-32 w-full items-center justify-center">
            <EmptyState icon="i-streamline-emojis-open-book text-4xl" description="暂无数据" />
          </div>

          <ul
            v-else
            class="m-0 p-0 list-none gap-4 grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] min-w-0 w-full"
          >
            <li v-for="plant in filteredList" :key="getItemKey(plant)" role="listitem">
              <AlmanacCard
                :plant="plant"
                :image-error="hasImageError(getItemKey(plant))"
                @select="openDetail(plant)"
                @image-error="onImageError(getItemKey(plant))"
              />
            </li>
          </ul>
        </a-spin>
      </div>
    </a-card>

    <AlmanacDetailModal
      v-model:open="detailVisible"
      :plant="selectedPlant"
    />
  </div>
</template>
