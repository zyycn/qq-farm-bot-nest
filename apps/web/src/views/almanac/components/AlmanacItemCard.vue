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
    class="group min-h-62 w-full cursor-pointer rounded-3xl p-3 text-left transition-colors transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ant-color-primary)] focus-visible:ring-offset-2"
    :class="cardClass()"
    @click="emit('select')"
  >
    <div class="flex items-start justify-between gap-2">
      <span
        v-if="item.qualityLabel"
        class="rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-[#8b5f2b] shadow-sm"
      >
        {{ item.qualityLabel }}
      </span>
      <span v-else class="h-6" />

      <a-tag size="small" :color="getCategoryTagColor(item.category)" class="!m-0 shrink-0">
        {{ item.categoryLabel }}
      </a-tag>
    </div>

    <div class="mt-3 flex h-26 items-center justify-center">
      <div class="flex h-23 w-23 items-center justify-center overflow-hidden rounded-[28px] bg-white/80 shadow-sm">
        <img
          v-if="item.image && !imageError"
          :src="item.image"
          :alt="item.name || '图鉴作物'"
          width="84"
          height="84"
          loading="lazy"
          class="h-21 w-21 object-contain transition-transform duration-200 group-hover:scale-105"
          @error="handleImageError"
        >
        <span v-else class="text-3xl font-bold a-color-text-tertiary">{{ (item.name || '图').slice(0, 1) }}</span>
      </div>
    </div>

    <div class="mt-3 flex flex-col gap-2.5">
      <div class="flex items-center gap-2">
        <div class="min-w-0 flex-1 truncate font-semibold a-color-text" :title="item.name">
          {{ item.name }}
        </div>
        <a-tag size="small" :color="getRarityTagColor(item.rarity)" class="!m-0 shrink-0">
          {{ item.rarityLabel }}
        </a-tag>
      </div>

      <div class="min-h-10 text-sm leading-5 a-color-text-secondary">
        {{ item.detailDescription }}
      </div>

      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="rounded-2xl px-2.5 py-2 a-bg-container">
          <div class="a-color-text-tertiary">
            成熟
          </div>
          <div class="mt-1 font-medium a-color-text">
            {{ item.growTimeText }}
          </div>
        </div>
        <div class="rounded-2xl px-2.5 py-2 a-bg-container">
          <div class="a-color-text-tertiary">
            收入
          </div>
          <div class="mt-1 font-medium a-color-text">
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
