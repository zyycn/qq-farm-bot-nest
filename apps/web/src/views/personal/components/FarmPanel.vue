<script setup lang="ts">
import type { MenuItemType } from 'antdv-next'
import type { SingleLandAction } from '../constants'
import type { FarmLand, FarmSummary } from '@/api/types'
import { storeToRefs } from 'pinia'
import { h, ref } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import LandCard from '@/components/LandCard.vue'
import { useFarmStore } from '@/stores'
import message from '@/utils/message'
import { FARM_OPERATIONS, SINGLE_LAND_ACTION_LABELS } from '../constants'
import FarmLandContextPanel from './FarmLandContextPanel.vue'

const props = defineProps<{
  lands: FarmLand[]
  summary?: FarmSummary | null
  connected?: boolean
  operating?: boolean
  currentAccountId?: string
}>()

const emit = defineEmits<{
  operate: [opType: string]
}>()

const farmStore = useFarmStore()
const { seeds } = storeToRefs(farmStore)

const operations = FARM_OPERATIONS
const singleOperating = ref(false)
const seedLoading = ref(false)
const contextPanelRef = ref<InstanceType<typeof FarmLandContextPanel> | null>(null)

function getContextMenuItems(land: FarmLand): MenuItemType[] {
  const landId = Number(land?.id ?? 0)
  const cropName = land?.plantName ? String(land.plantName) : '空地'
  const firstLabel = landId ? `详细信息 · #${landId} ${cropName}` : '详细信息'
  return [
    { key: 'detail', label: firstLabel, icon: () => h('span', { class: 'i-streamline-emojis-leaf-fluttering-in-wind' }) },
    { type: 'divider' },
    { key: 'remove', label: SINGLE_LAND_ACTION_LABELS.remove, icon: () => h('span', { class: 'i-streamline-emojis-cross-mark' }) },
    { key: 'plant', label: SINGLE_LAND_ACTION_LABELS.plant, icon: () => h('span', { class: 'i-streamline-emojis-seedling' }) },
    { key: 'organic_fertilize', label: SINGLE_LAND_ACTION_LABELS.organic_fertilize, icon: () => h('span', { class: 'i-streamline-emojis-herb' }) }
  ]
}

const activeLand = ref<FarmLand | null>(null)

function onMenuClick(info: { key: string }): void {
  const land = activeLand.value
  if (!land)
    return
  if (info.key === 'detail') {
    contextPanelRef.value?.openDetail(land)
    return
  }
  const action = info.key as SingleLandAction
  if (action === 'plant') {
    contextPanelRef.value?.openSeedDialog(land)
    return
  }
  handleOperateSingleLand({ action, landId: Number(land.id) })
}

function onDropdownOpenChange(open: boolean, land: FarmLand): void {
  if (open)
    activeLand.value = land
}

function onDblClick(e: MouseEvent, land: FarmLand): void {
  activeLand.value = land
  const target = e.currentTarget as HTMLElement
  if (!target)
    return
  const syntheticEvent = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: e.clientX,
    clientY: e.clientY,
    screenX: e.screenX,
    screenY: e.screenY
  })
  target.dispatchEvent(syntheticEvent)
}

async function handleFetchBagSeeds(): Promise<void> {
  const accountId = props.currentAccountId
  if (!accountId)
    return
  seedLoading.value = true
  try {
    await farmStore.fetchBagSeeds(accountId)
  } catch {
    message.error('获取背包种子失败')
  } finally {
    seedLoading.value = false
  }
}

async function handleOperateSingleLand(payload: { action: SingleLandAction, landId: number, seedId?: number }): Promise<void> {
  const accountId = props.currentAccountId
  if (!accountId)
    return
  singleOperating.value = true
  try {
    await farmStore.operateSingleLand(accountId, payload)
    const label = SINGLE_LAND_ACTION_LABELS[payload.action]
    message.success(`地块 #${payload.landId} 已执行${label}`)
  } catch (e: unknown) {
    const error = e as { message?: string }
    message.error(error?.message ?? '单地块操作失败')
  } finally {
    singleOperating.value = false
  }
}

function handleOperate(opType: string): void {
  emit('operate', opType)
}
</script>

<template>
  <a-card variant="borderless" class="flex-1 overflow-hidden" :classes="{ body: '!p-0 !h-full !flex !flex-col' }">
    <div
      class="px-3 py-2 border-b flex flex-wrap gap-2 items-center justify-between a-border-b-border-sec"
    >
      <div class="flex shrink flex-wrap gap-2 min-w-0 items-center">
        <div class="px-2.5 py-1 flex gap-1.5 items-center a-bg-layout rounded-lg">
          <div class="i-streamline-emojis-cooked-rice" />
          <span class="hidden a-color-text-secondary text-sm xl:inline">可收</span>
          <span class="font-bold a-color-text">{{ summary?.harvestable || 0 }}</span>
        </div>
        <div class="px-2.5 py-1 flex gap-1.5 items-center a-bg-layout rounded-lg">
          <div class="i-streamline-emojis-seedling" />
          <span class="hidden a-color-text-secondary text-sm xl:inline">生长</span>
          <span class="font-bold a-color-text">{{ summary?.growing || 0 }}</span>
        </div>
        <div class="px-2.5 py-1 flex gap-1.5 items-center a-bg-layout rounded-lg">
          <div class="i-streamline-emojis-custard" />
          <span class="hidden a-color-text-secondary text-sm xl:inline">空闲</span>
          <span class="font-bold a-color-text">{{ summary?.empty || 0 }}</span>
        </div>
        <div v-if="(summary?.dead || 0) > 0" class="px-2.5 py-1 flex gap-1.5 items-center a-bg-layout rounded-lg">
          <span class="hidden a-color-text-secondary text-sm xl:inline">枯萎</span>
          <span class="font-bold a-color-error">{{ summary?.dead || 0 }}</span>
        </div>
      </div>

      <div class="flex shrink-0 flex-wrap gap-1 items-center justify-end">
        <a-tooltip v-for="op in operations" :key="op.type" :title="op.label" placement="bottom">
          <a-button
            :disabled="operating || !connected"
            :type="op.type === 'all' ? 'primary' : 'default'"
            size="small"
            class="h-7!"
            @click="handleOperate(op.type)"
          >
            <template #icon>
              <div :class="op.icon" />
            </template>
            <span class="hidden xl:inline">{{ op.label }}</span>
          </a-button>
        </a-tooltip>
      </div>
    </div>

    <div class="p-3 flex flex-1 flex-col min-h-0 overflow-y-auto">
      <div v-if="!connected || !lands || lands.length === 0" class="flex flex-1 min-h-0 items-center justify-center">
        <EmptyState v-if="!connected" icon="i-streamline-emojis-satellite-antenna text-4xl" description="账号未连接" />
        <EmptyState v-else icon="i-streamline-emojis-seedling text-4xl" description="暂无土地数据" />
      </div>
      <div v-else class="gap-2.5 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
        <a-dropdown
          v-for="land in lands"
          :key="land.id"
          :menu="{ items: getContextMenuItems(land), onClick: onMenuClick }"
          :trigger="['contextmenu']"
          @open-change="(open: boolean) => onDropdownOpenChange(open, land)"
        >
          <div class="min-w-0" @dblclick="onDblClick($event, land)">
            <LandCard :land="land" />
          </div>
        </a-dropdown>
      </div>
    </div>

    <FarmLandContextPanel
      ref="contextPanelRef"
      :seeds="seeds"
      :single-operating="singleOperating"
      :seed-loading="seedLoading"
      @fetch-bag-seeds="handleFetchBagSeeds"
      @operate-single-land="handleOperateSingleLand"
    />
  </a-card>
</template>
