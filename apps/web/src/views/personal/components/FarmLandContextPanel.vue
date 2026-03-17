<script setup lang="ts">
import type { SingleLandAction } from '../constants'
import { computed, ref, watch } from 'vue'
import {
  getMutantInfo,
  LAND_LEVEL_NAMES,
  LAND_STATUS_ICONS,
  LAND_STATUS_NAMES
} from '../constants'

interface LandDetail {
  id: number
  level?: number
  status?: string
  phaseName?: string
  plantName?: string
  seedImage?: string
  matureInSec?: number
  exp?: number
  fruitName?: string
  fruitCount?: number
  fruitPrice?: number
  totalIncome?: number
  growTimeText?: string
  landLevelNeed?: number
  currentSeason?: number
  totalSeasons?: number
  plantSize?: number
  mutantActiveIds?: number[]
  mutants?: Array<{ typeId: number, fruitId: number, chance: number }>
  [key: string]: unknown
}

interface BagSeedItem {
  seedId: number
  name: string
  count?: number
  requiredLevel?: number
  plantSize?: number
  image?: string
}

const props = defineProps<{
  seeds: BagSeedItem[]
  singleOperating: boolean
  seedLoading: boolean
}>()

const emit = defineEmits<{
  fetchBagSeeds: []
  operateSingleLand: [payload: { action: SingleLandAction, landId: number, seedId?: number }]
}>()

const seedDialogVisible = ref(false)
const selectedSeedId = ref<number | null>(null)
const detailVisible = ref(false)
const targetLand = ref<LandDetail | null>(null)
const targetLandId = ref(0)

const bagSeeds1x1 = computed(() =>
  (props.seeds || []).filter(s => Number(s.plantSize ?? 1) <= 1))

const canSubmitSeedPlant = computed(() => {
  if (selectedSeedId.value == null)
    return false
  const seed = props.seeds.find(s => Number(s.seedId) === Number(selectedSeedId.value))
  if (!seed)
    return false
  return Number(seed.count ?? 0) > 0 && Number(seed.plantSize ?? 1) <= 1
})

const detailItems = computed(() => {
  const land = targetLand.value
  if (!land)
    return []
  const items: Array<{ label: string, value: string, icon?: string }> = []

  items.push({ label: '土地等级', value: LAND_LEVEL_NAMES[land.level ?? 0] ?? String(land.level ?? '-') })

  const status = land.status
  items.push({
    label: '当前状态',
    value: LAND_STATUS_NAMES[status ?? ''] ?? land.phaseName ?? '-',
    icon: LAND_STATUS_ICONS[status ?? ''] ?? ''
  })

  if (land.phaseName && status !== 'empty')
    items.push({ label: '生长阶段', value: land.phaseName })

  if ((land.matureInSec ?? 0) > 0)
    items.push({ label: '成熟倒计时', value: formatTime(land.matureInSec!), icon: 'i-streamline-emojis-hourglass-done' })

  if (land.exp != null)
    items.push({ label: '经验', value: String(land.exp) })

  if (land.fruitName)
    items.push({ label: '收获果实', value: `${land.fruitName} × ${land.fruitCount ?? 0}` })

  if (land.fruitPrice != null && land.fruitPrice > 0)
    items.push({ label: '果实单价', value: `${land.fruitPrice} 金币` })

  if (land.totalIncome != null && land.totalIncome > 0)
    items.push({ label: '预估收入', value: `${land.totalIncome} 金币` })

  if (land.growTimeText)
    items.push({ label: '生长时间', value: land.growTimeText })

  if (land.landLevelNeed != null)
    items.push({ label: '所需土地等级', value: `${land.landLevelNeed} 级` })

  if ((land.totalSeasons ?? 0) > 1)
    items.push({ label: '季数', value: `第 ${land.currentSeason ?? 1} / ${land.totalSeasons} 季` })

  if ((land.plantSize ?? 1) > 1)
    items.push({ label: '占地', value: `${land.plantSize}×${land.plantSize}` })

  return items
})

const activeMutants = computed(() => {
  const land = targetLand.value
  if (!land?.mutantActiveIds?.length)
    return []
  return land.mutantActiveIds.map(id => ({ id, ...getMutantInfo(id) }))
})

const mutantsList = computed(() => {
  const arr = targetLand.value?.mutants
  if (!Array.isArray(arr) || arr.length === 0)
    return []
  return arr
})

function openSeedDialog(land: LandDetail): void {
  targetLand.value = land
  targetLandId.value = Number(land.id ?? 0)
  emit('fetchBagSeeds')
  seedDialogVisible.value = true
  const firstEnabled = bagSeeds1x1.value.find(s => Number(s.count ?? 0) > 0)
  selectedSeedId.value = firstEnabled ? Number(firstEnabled.seedId) : null
}

function closeSeedDialog(): void {
  seedDialogVisible.value = false
  selectedSeedId.value = null
}

function confirmSeedPlant(): void {
  if (!canSubmitSeedPlant.value || selectedSeedId.value == null)
    return
  emit('operateSingleLand', { action: 'plant', landId: targetLandId.value, seedId: selectedSeedId.value })
  closeSeedDialog()
}

function openDetail(land: LandDetail): void {
  targetLand.value = land
  targetLandId.value = Number(land.id ?? 0)
  detailVisible.value = true
}

function formatTime(sec: number): string {
  if (sec <= 0)
    return '0秒'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const parts: string[] = []
  if (h > 0)
    parts.push(`${h}小时`)
  if (m > 0)
    parts.push(`${m}分`)
  if (s > 0 || parts.length === 0)
    parts.push(`${s}秒`)
  return parts.join('')
}

watch(
  () => bagSeeds1x1.value,
  (list) => {
    if (seedDialogVisible.value && list.length > 0 && selectedSeedId.value == null) {
      const first = list.find(s => Number(s.count ?? 0) > 0)
      selectedSeedId.value = first ? Number(first.seedId) : Number(list[0].seedId)
    }
  },
  { immediate: false }
)

defineExpose({
  openSeedDialog,
  openDetail
})
</script>

<template>
  <!-- 种子选择弹窗 -->
  <a-modal
    v-model:open="seedDialogVisible"
    title="选择种子"
    :width="420"
    centered
    @cancel="closeSeedDialog"
  >
    <p class="mb-3 a-color-text-secondary text-sm">
      地块 #{{ targetLandId }}（仅支持 1x1 种子）
    </p>
    <div v-if="seedLoading" class="py-8 text-center a-color-text-tertiary">
      <a-spin />
      <p class="mt-2">
        加载中…
      </p>
    </div>
    <div v-else-if="!bagSeeds1x1.length" class="py-8 text-center a-color-text-tertiary">
      背包暂无 1x1 种子
    </div>
    <div v-else class="max-h-72 overflow-y-auto space-y-1.5">
      <div
        v-for="seed in bagSeeds1x1"
        :key="seed.seedId"
        class="p-2.5 flex gap-3 cursor-pointer transition-colors items-center rounded-lg"
        :class="selectedSeedId === seed.seedId ? 'a-bg-primary-bg shadow-sm' : 'hover:a-bg-layout'"
        @click="selectedSeedId = Number(seed.seedId)"
      >
        <div class="flex shrink-0 h-10 w-10 items-center justify-center overflow-hidden a-bg-layout rounded-lg">
          <img
            v-if="seed.image"
            :src="seed.image"
            class="h-8 w-8 object-contain"
          >
          <span v-else class="i-streamline-emojis-seedling a-color-text-tertiary text-xl" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-medium truncate a-color-text">
            {{ seed.name }}
          </div>
          <div class="mt-0.5 a-color-text-tertiary text-xs">
            数量 {{ seed.count ?? 0 }} · {{ seed.requiredLevel ?? 0 }}级
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="flex gap-2 justify-end">
        <a-button @click="closeSeedDialog">
          取消
        </a-button>
        <a-button type="primary" :disabled="!canSubmitSeedPlant" @click="confirmSeedPlant">
          确认种植
        </a-button>
      </div>
    </template>
  </a-modal>

  <!-- 地块详情弹窗 -->
  <a-modal
    v-model:open="detailVisible"
    :footer="null"
    :width="400"
    centered
  >
    <template v-if="targetLand">
      <!-- Header -->
      <div class="flex gap-3 items-center">
        <div class="flex shrink-0 h-14 w-14 items-center justify-center overflow-hidden a-bg-layout rounded-xl">
          <img
            v-if="targetLand.seedImage"
            :src="targetLand.seedImage"
            class="h-10 w-10 object-contain"
          >
          <span v-else class="i-streamline-emojis-seedling a-color-text-quat text-3xl" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold a-color-text text-lg">
            {{ targetLand.plantName || '空地' }}
          </div>
          <div class="mt-0.5 a-color-text-secondary text-sm">
            地块 #{{ targetLand.id }} · {{ LAND_LEVEL_NAMES[targetLand.level ?? 0] ?? '' }}
          </div>
        </div>
      </div>

      <!-- Info Grid -->
      <div v-if="detailItems.length" class="mt-4 gap-2 grid grid-cols-2">
        <div
          v-for="item in detailItems"
          :key="item.label"
          class="px-3 py-2 a-bg-layout rounded-lg"
        >
          <div class="a-color-text-tertiary text-xs">
            {{ item.label }}
          </div>
          <div class="font-medium mt-0.5 flex gap-1.5 items-center a-color-text text-sm">
            <span v-if="item.icon" :class="item.icon" class="shrink-0 text-base" />
            {{ item.value }}
          </div>
        </div>
      </div>

      <!-- Mutations -->
      <div v-if="activeMutants.length || mutantsList.length" class="mt-3 p-3 a-bg-layout rounded-lg">
        <div class="font-medium mb-2 a-color-text-secondary text-xs">
          变异信息
        </div>
        <div v-if="activeMutants.length" class="flex flex-wrap gap-1.5">
          <a-tag v-for="m in activeMutants" :key="m.id" :color="m.color">
            {{ `${m.name} · ${m.effect}` }}
          </a-tag>
        </div>
        <div v-else-if="mutantsList.length" class="a-color-text-tertiary text-xs" :class="activeMutants.length ? 'mt-2' : ''">
          可变异（{{ mutantsList.map(x => x.chance).join('%、') }}% 概率）
        </div>
      </div>

      <div v-if="!targetLand.plantName" class="mt-4 text-center a-color-text-tertiary text-sm">
        该地块暂无作物
      </div>
    </template>
  </a-modal>
</template>
