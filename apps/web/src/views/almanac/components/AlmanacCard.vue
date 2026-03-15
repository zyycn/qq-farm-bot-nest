<script setup lang="ts">
import type { AlmanacItem } from '@/api/modules/almanac'
import { computed } from 'vue'
import { getCategoryTagColor, getStatusTagColor } from '../constants'

const props = defineProps<{
  plant: AlmanacItem
  imageError: boolean
}>()

const emit = defineEmits<{
  select: []
  imageError: []
}>()

const isUnlocked = computed(() => !!props.plant.lit)
</script>

<template>
  <div
    class="group p-2.5 flex flex-col gap-2 min-h-[210px] cursor-pointer transition-all duration-200 items-center border rounded-2xl focus-visible:ring-2 focus-visible:ring-[var(--ant-color-primary)] focus-visible:ring-offset-2"
    :class="[
      isUnlocked
        ? 'a-bg-layout border a-border-border hover:shadow-md hover:border-green-4/40'
        : 'a-bg-container border-1 border-dashed a-border-primary hover:border-primary/30 hover:shadow-sm'
    ]"
    tabindex="0"
    @click="emit('select')"
    @keydown.enter="emit('select')"
    @keydown.space.prevent="emit('select')"
  >
    <!-- 左上分类 + 右上品级 -->
    <div class="flex gap-1 min-w-0 w-full items-start justify-between">
      <div v-if="plant.categoryLabel" class="shrink-0">
        <a-tag size="small" :color="getCategoryTagColor(plant.category)" class="text-[10px] rounded-full !m-0">
          {{ plant.categoryLabel }}
        </a-tag>
      </div>
      <div v-if="(plant.qualityLabel || plant.rarityLabel) && isUnlocked" class="text-[10px] px-2 py-0.5 rounded-full shrink-0 a-color-text-secondary a-bg-container">
        {{ plant.qualityLabel || plant.rarityLabel }}
      </div>
    </div>

    <!-- 作物图：已点亮显示图，未点亮显示问号 + 解锁暗示 -->
    <div class="mt-1 relative -mt-1">
      <div
        class="mb-1 flex shrink-0 flex-col gap-0.5 h-14 w-14 transition-colors items-center justify-center overflow-hidden rounded-xl"
        :class="
          isUnlocked
            ? 'a-bg-primary-bg ring-2 ring-green-4/20 ring-inset'
            : 'a-bg-layout border-2 border-dashed a-border-primary'
        "
      >
        <template v-if="isUnlocked">
          <img
            v-if="plant.image && !imageError"
            :src="plant.image"
            width="48"
            height="48"
            class="h-10 w-10 object-contain drop-shadow-sm"
            loading="lazy"
            :alt="plant.name || '作物'"
            @error="emit('imageError')"
          >
          <span v-else class="font-bold a-color-text-tertiary text-xl">{{ (plant.name || '?').slice(0, 1) }}</span>
        </template>
        <template v-else>
          <span class="font-bold a-color-text-quaternary text-2xl">?</span>
          <span class="i-streamline-emojis-seedling a-color-text-quaternary text-sm" aria-hidden />
        </template>
      </div>
    </div>

    <!-- 名称 -->
    <div class="mb-1 text-center min-w-0 w-full">
      <div
        class="leading-tight font-semibold truncate text-sm"
        :class="isUnlocked ? 'a-color-text' : 'a-color-text-secondary'"
        :title="plant.name"
      >
        {{ plant.name || `作物${plant.seedId}` }}
      </div>
    </div>

    <!-- 成熟 + 收入：图标 + 数值，小号 -->
    <div class="gap-2.5 grid grid-cols-2 w-full">
      <div
        class="px-1.5 py-1 flex gap-0.5 items-center justify-center a-bg-container rounded-lg"
        :title="isUnlocked ? plant.growTimeText : undefined"
      >
        <span class="text-amber-5 i-streamline-emojis-hourglass-done shrink-0 text-sm" aria-hidden />
        <span v-if="isUnlocked" class="text-[10px] font-medium truncate a-color-text">{{ plant.growTimeText }}</span>
        <span v-else class="text-[10px] a-color-text-quaternary">—</span>
      </div>
      <div
        class="px-1.5 py-1 flex gap-0.5 items-center justify-center a-bg-container rounded-lg"
        :title="isUnlocked ? plant.seasonalIncomeLabel : undefined"
      >
        <span class="i-streamline-emojis-money-bag text-green-5 shrink-0 text-sm" aria-hidden />
        <span v-if="isUnlocked" class="text-[10px] font-medium truncate a-color-text">{{ plant.seasonalIncomeLabel }}</span>
        <span v-else class="text-[10px] a-color-text-quaternary">—</span>
      </div>
    </div>

    <!-- 状态 + 稀有度 + 点亮进度 -->
    <div class="mt-1 flex flex-wrap gap-1 justify-center">
      <a-tag size="small" :color="getStatusTagColor(plant)" class="text-[10px] rounded-full !m-0">
        {{ plant.statusLabel }}
      </a-tag>
      <a-tag v-if="plant.rarityLabel" size="small" color="blue" class="text-[10px] rounded-full !m-0">
        {{ plant.rarityLabel }}
      </a-tag>
      <a-tag v-if="isUnlocked && plant.litReward > 0" size="small" color="orange" class="text-[10px] rounded-full !m-0">
        +{{ plant.litReward }}
      </a-tag>
    </div>
  </div>
</template>
