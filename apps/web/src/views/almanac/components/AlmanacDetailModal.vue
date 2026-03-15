<script setup lang="ts">
import type { AlmanacItem } from '@/api/modules/almanac'
import { computed } from 'vue'
import { getCategoryTagColor, getLevelTag } from '../constants'

const props = defineProps<{
  plant: AlmanacItem | null
}>()

const visible = defineModel<boolean>('open', { default: false })

const stats = computed(() => {
  const p = props.plant
  if (!p)
    return []

  return [
    { label: '成熟时间', value: p.growTimeText, icon: 'i-streamline-emojis-hourglass-done' },
    { label: '季产数量', value: p.seasonalYieldLabel, icon: 'i-streamline-emojis-grapes' },
    { label: '可收季数', value: `${p.seasons} 季`, icon: 'i-streamline-emojis-four-leaf-clover' },
    { label: '果实单价', value: p.fruitPriceLabel, icon: 'i-streamline-emojis-credit-card' },
    { label: '每季经验', value: `${p.exp}`, icon: 'i-streamline-emojis-sparkles' },
    { label: '季产收入', value: p.seasonalIncomeLabel, icon: 'i-streamline-emojis-money-bag' }
  ]
})

const extraStats = computed(() => {
  const p = props.plant
  if (!p)
    return []

  const items: Array<{ label: string, value: string }> = []
  if (p.rewardDescription)
    items.push({ label: '点亮说明', value: p.rewardDescription })
  return items
})

const isUnlocked = computed(() => !!props.plant?.lit)

const rewardPreview = computed(() => {
  const p = props.plant
  if (!p?.reward)
    return null
  return `${p.reward.name} x${p.reward.count}`
})

const sourceLabels = computed(() => {
  const p = props.plant
  if (!p?.sourceLabels?.length)
    return ['种子商店', '活动获取']
  return p.sourceLabels.filter(Boolean)
})
</script>

<template>
  <a-modal
    v-model:open="visible"
    :footer="null"
    :width="520"
    class="almanac-detail-modal max-w-[95vw] sm:max-w-none"
    centered
  >
    <template v-if="plant">
      <!-- 头部：大图 + 名称 + 多标签（紧凑） -->
      <div class="flex gap-3 items-start">
        <div
          class="border-2 flex shrink-0 h-17 w-17 transition-colors items-center justify-center overflow-hidden rounded-xl"
          :class="isUnlocked ? 'a-bg-primary-bg border-green-4/30 ring-2 ring-green-4/20 ring-inset' : 'a-bg-layout border-dashed a-border-color-border'"
        >
          <template v-if="isUnlocked">
            <img
              v-if="plant.image"
              :src="plant.image"
              class="h-14 w-14 object-contain drop-shadow-sm"
              loading="lazy"
              :alt="plant.name"
            >
            <span v-else class="font-bold a-color-text-tertiary text-2xl">{{ (plant.name || '?').slice(0, 1) }}</span>
          </template>
          <span v-else class="a-color-text-quaternary text-3xl">?</span>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="leading-tight font-semibold m-0 text-base sm:text-lg" :class="isUnlocked ? 'a-color-text' : 'a-color-text-tertiary'">
            {{ plant.name || '未知作物' }}
          </h3>
          <p class="leading-snug mb-1.5 mt-1 line-clamp-2 a-color-text-secondary text-xs sm:text-sm">
            {{ isUnlocked ? (plant.detailDescription || '收获果实即可点亮图鉴') : '收获该作物果实后可点亮图鉴' }}
          </p>
          <div class="flex flex-wrap gap-1 items-center">
            <a-tag :color="getLevelTag(plant.quality).color" class="text-[10px] rounded-full m-0!">
              {{ plant.rarityLabel || getLevelTag(plant.quality).text }}
            </a-tag>
            <a-tag v-if="plant.categoryLabel" :color="getCategoryTagColor(plant.category)" class="text-[10px] rounded-full m-0!">
              {{ plant.categoryLabel }}
            </a-tag>
            <a-tag :color="isUnlocked ? 'green' : 'default'" class="text-[10px] rounded-full m-0!">
              {{ plant.statusLabel }}
            </a-tag>
            <a-tag v-if="isUnlocked && plant.litReward > 0" color="orange" class="text-[10px] rounded-full m-0!">
              +{{ plant.litReward }}
            </a-tag>
          </div>
        </div>
      </div>

      <div v-if="!isUnlocked" class="bg-amber-1 border-amber-3/50 mt-3 px-3 py-2 text-center a-color-text-secondary border text-xs rounded-lg">
        该图鉴尚未解锁，种植并收获对应作物后可查看详情。
      </div>

      <template v-else>
        <!-- 基础统计 -->
        <div class="mt-3">
          <div class="font-medium mb-1.5 flex gap-1 items-center a-color-text-secondary text-xs">
            <span class="i-streamline-emojis-four-leaf-clover text-xs" />
            作物数据
          </div>
          <div class="gap-1.5 grid grid-cols-2">
            <div
              v-for="s in stats"
              :key="s.label"
              class="px-2.5 py-2 flex gap-1.5 a-bg-layout a-border-border border rounded-lg"
            >
              <span :class="s.icon" class="text-green-5 mt-0.5 shrink-0 text-base" />
              <div class="min-w-0">
                <div class="text-[10px] a-color-text-tertiary">
                  {{ s.label }}
                </div>
                <div class="font-semibold mt-0.5 a-color-text text-xs">
                  {{ s.value }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 点亮收益 -->
        <div class="mt-2.5 p-2.5 border-green-4/30 a-bg-layout border rounded-lg">
          <div class="font-medium mb-1 flex gap-1 items-center a-color-text text-xs">
            <span class="text-amber-5 i-streamline-emojis-sparkles text-xs" />
            点亮收益
          </div>
          <p v-if="plant.rewardDescription" class="leading-snug m-0 line-clamp-2 a-color-text-secondary text-xs">
            {{ plant.rewardDescription }}
          </p>
          <div v-if="rewardPreview" class="font-medium mt-1.5 px-2 py-0.5 inline-flex gap-1 items-center a-color-text a-bg-container text-xs rounded-md">
            <span class="i-streamline-emojis-wrapped-gift-1 text-sm" />
            {{ rewardPreview }}
          </div>
          <div v-else-if="plant.litReward > 0" class="font-medium mt-1.5 px-2 py-0.5 inline-flex gap-1 items-center a-color-text a-bg-container text-xs rounded-md">
            <span class="text-amber-5 i-streamline-emojis-sparkles text-xs" />
            +{{ plant.litReward }}
          </div>
        </div>

        <!-- 更多信息 -->
        <div v-if="extraStats.length" class="mt-2 p-2.5 a-bg-layout a-border-border border rounded-lg">
          <div class="font-medium mb-1 flex gap-1 items-center a-color-text-secondary text-xs">
            <span class="i-streamline-emojis-open-book text-xs" />
            更多信息
          </div>
          <div class="gap-x-3 gap-y-1 grid grid-cols-2">
            <div v-for="e in extraStats" :key="e.label" class="flex gap-1.5 justify-between text-xs">
              <span class="shrink-0 a-color-text-tertiary">{{ e.label }}</span>
              <span class="font-medium text-right max-w-36 truncate a-color-text" :title="e.value">{{ e.value }}</span>
            </div>
          </div>
        </div>

        <!-- 获取途径 -->
        <div class="mt-2 p-2.5 a-bg-layout a-border-border border rounded-lg">
          <div class="font-medium mb-1 flex gap-1 items-center a-color-text-secondary text-xs">
            <span class="i-streamline-emojis-leaf-fluttering-in-wind text-xs" />
            获取途径
          </div>
          <div class="flex flex-wrap gap-1">
            <a-tag v-for="label in sourceLabels" :key="label" color="default" class="text-[10px] rounded-full m-0!">
              {{ label }}
            </a-tag>
          </div>
        </div>
      </template>
    </template>
  </a-modal>
</template>
