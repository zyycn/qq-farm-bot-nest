<script setup lang="ts">
import type { AlmanacItem } from '@/api/modules/almanac'
import { computed } from 'vue'
import { getCategoryTagColor, getRarityTagColor, getStatusTagColor } from '../constants'

const props = defineProps<{
  open: boolean
  item: AlmanacItem | null
  imageError: boolean
}>()

const emit = defineEmits<{
  cancel: []
  imageError: []
}>()

const statItems = computed(() => {
  if (!props.item)
    return []

  return [
    { label: '成熟时间', value: props.item.growTimeText },
    { label: '可收季数', value: `${props.item.seasons} 季` },
    { label: '经验收益', value: `${props.item.exp}/季` },
    { label: '果实售价', value: props.item.fruitPriceLabel },
    { label: '季产数量', value: props.item.seasonalYieldLabel },
    { label: '季产收入', value: props.item.seasonalIncomeLabel }
  ]
})

const sourceLabels = computed(() => props.item?.sourceLabels.filter(Boolean) ?? [])

function handleCancel(): void {
  emit('cancel')
}

function handleImageError(): void {
  emit('imageError')
}
</script>

<template>
  <a-modal
    :open="open"
    title="图鉴详情"
    :width="760"
    :footer="null"
    centered
    @cancel="handleCancel"
  >
    <div v-if="item" class="flex flex-col gap-4">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div class="rounded-[30px] flex shrink-0 h-28 w-28 items-center justify-center overflow-hidden from-[#fff8e2] to-[#f6efe2] bg-gradient-to-br">
          <img
            v-if="item.image && !imageError"
            :src="item.image"
            :alt="item.name || '图鉴作物'"
            width="108"
            height="108"
            loading="lazy"
            class="h-24 w-24 object-contain"
            @error="handleImageError"
          >
          <span v-else class="font-bold a-color-text-tertiary text-4xl">{{ (item.name || '图').slice(0, 1) }}</span>
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap gap-2 items-center">
            <h3 class="font-semibold min-w-0 truncate a-color-text text-xl" :title="item.name">
              {{ item.name }}
            </h3>
            <a-tag v-if="item.qualityLabel" size="small" color="orange">
              {{ item.qualityLabel }}
            </a-tag>
            <a-tag size="small" :color="getRarityTagColor(item.rarity)">
              {{ item.rarityLabel }}
            </a-tag>
            <a-tag size="small" :color="getStatusTagColor(item)">
              {{ item.statusLabel }}
            </a-tag>
          </div>

          <div class="leading-6 mt-3 a-color-text-secondary">
            {{ item.detailDescription }}
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <a-tag size="small" :color="getCategoryTagColor(item.category)">
              {{ item.categoryLabel }}
            </a-tag>
            <a-tag v-if="item.litReward > 0" size="small" color="gold">
              +{{ item.litReward }} 图鉴进度
            </a-tag>
          </div>
        </div>
      </div>

      <div class="gap-3 grid lg:grid-cols-3 sm:grid-cols-2">
        <div
          v-for="stat in statItems"
          :key="stat.label"
          class="p-3 border-solid a-bg-layout a-border-border-sec border rounded-3xl"
        >
          <div class="a-color-text-tertiary text-xs">
            {{ stat.label }}
          </div>
          <div class="leading-6 font-semibold mt-2 a-color-text">
            {{ stat.value }}
          </div>
        </div>
      </div>

      <div class="p-4 border-solid a-bg-layout a-border-border-sec border rounded-3xl">
        <div class="font-semibold a-color-text">
          点亮收益
        </div>
        <div class="leading-6 mt-2 a-color-text-secondary">
          {{ item.rewardDescription }}
        </div>
        <div class="font-semibold mt-4 px-3 py-2 inline-flex a-color-text a-bg-container text-sm rounded-2xl">
          {{ item.litReward > 0 ? `+${item.litReward} 图鉴进度` : '点亮后增加图鉴进度' }}
        </div>
      </div>

      <div class="p-4 border-solid a-bg-layout a-border-border-sec border rounded-3xl">
        <div class="font-semibold a-color-text">
          获取途径
        </div>
        <div v-if="sourceLabels.length" class="mt-3 flex flex-wrap gap-2">
          <a-tag v-for="label in sourceLabels" :key="label" size="small" color="default">
            {{ label }}
          </a-tag>
        </div>
        <div v-else class="mt-3 a-color-text-tertiary text-sm">
          暂无来源信息
        </div>
      </div>
    </div>
  </a-modal>
</template>
