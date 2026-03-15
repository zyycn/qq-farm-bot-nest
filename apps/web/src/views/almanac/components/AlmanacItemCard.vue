<script setup lang="ts">
import type { AlmanacItem } from '@/api/modules/almanac'
import { getCategoryTagColor, getRarityTagColor, getStatusTagColor } from '../constants'

const props = defineProps<{
  item: AlmanacItem
  imageError: boolean
}>()

const emit = defineEmits<{
  select: []
  imageError: []
}>()

function handleImageError(): void {
  emit('imageError')
}

function cardClass(): string {
  if (props.item.isNew)
    return 'border border-solid border-amber-300 bg-amber-50/80 hover:shadow-md'
  if (props.item.lit)
    return 'border border-solid border-lime-200 bg-lime-50/70 hover:shadow-md'
  return 'border border-dashed border-[#e6dcc6] bg-[#faf5e8] hover:border-[#d7c39d]'
}
</script>

<template>
  <button
    type="button"
    class="group p-3 text-left min-h-62 w-full cursor-pointer transition-colors transition-shadow duration-200 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ant-color-primary)] focus-visible:ring-offset-2"
    :class="cardClass()"
    @click="emit('select')"
  >
    <div class="flex gap-2 items-start justify-between">
      <span
        v-if="item.qualityLabel"
        class="text-[#8b5f2b] font-semibold px-2 py-1 rounded-full bg-white/80 text-xs shadow-sm"
      >
        {{ item.qualityLabel }}
      </span>
      <span v-else class="h-6" />

      <a-tag size="small" :color="getCategoryTagColor(item.category)" class="shrink-0 !m-0">
        {{ item.categoryLabel }}
      </a-tag>
    </div>

    <div class="mt-3 flex h-26 items-center justify-center">
      <div class="rounded-[28px] bg-white/80 flex h-23 w-23 items-center justify-center overflow-hidden shadow-sm">
        <img
          v-if="item.image && !imageError"
          :src="item.image"
          :alt="item.name || '图鉴作物'"
          width="84"
          height="84"
          loading="lazy"
          class="h-21 w-21 transition-transform duration-200 object-contain group-hover:scale-105"
          @error="handleImageError"
        >
        <span v-else class="font-bold a-color-text-tertiary text-3xl">{{ (item.name || '图').slice(0, 1) }}</span>
      </div>
    </div>

    <div class="mt-3 flex flex-col gap-2.5">
      <div class="flex gap-2 items-center">
        <div class="font-semibold flex-1 min-w-0 truncate a-color-text" :title="item.name">
          {{ item.name }}
        </div>
        <a-tag size="small" :color="getRarityTagColor(item.rarity)" class="shrink-0 !m-0">
          {{ item.rarityLabel }}
        </a-tag>
      </div>

      <div class="leading-5 min-h-10 a-color-text-secondary text-sm">
        {{ item.detailDescription }}
      </div>

      <div class="gap-2 grid grid-cols-2 text-xs">
        <div class="px-2.5 py-2 a-bg-container rounded-2xl">
          <div class="a-color-text-tertiary">
            成熟
          </div>
          <div class="font-medium mt-1 a-color-text">
            {{ item.growTimeText }}
          </div>
        </div>
        <div class="px-2.5 py-2 a-bg-container rounded-2xl">
          <div class="a-color-text-tertiary">
            收入
          </div>
          <div class="font-medium mt-1 a-color-text">
            {{ item.seasonalIncomeLabel }}
          </div>
        </div>
      </div>

      <div class="flex flex-wrap gap-1.5">
        <a-tag size="small" :color="getStatusTagColor(item)" class="!m-0">
          {{ item.statusLabel }}
        </a-tag>
        <a-tag v-if="item.litReward > 0" size="small" color="orange" class="!m-0">
          +{{ item.litReward }} 进度
        </a-tag>
        <a-tag v-if="item.sourceLabels[0]" size="small" color="default" class="!m-0">
          {{ item.sourceLabels[0] }}
        </a-tag>
      </div>
    </div>
  </button>
</template>
