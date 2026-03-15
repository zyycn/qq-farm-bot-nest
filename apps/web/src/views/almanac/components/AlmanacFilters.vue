<script setup lang="ts">
import type { AlmanacCategoryFilter, AlmanacStatusFilter } from '../constants'
import { CATEGORY_OPTIONS, STATUS_OPTIONS } from '../constants'

defineProps<{
  totalCount: number
  filteredCount: number
  categoryCounts: Record<AlmanacCategoryFilter, number>
  statusCounts: Record<AlmanacStatusFilter, number>
}>()

const category = defineModel<AlmanacCategoryFilter>('category', { required: true })
const status = defineModel<AlmanacStatusFilter>('status', { required: true })
const searchQuery = defineModel<string>('searchQuery', { required: true })

function buttonClass(active: boolean): string {
  return active
    ? 'border border-solid a-border-primary a-bg-primary-bg a-color-primary shadow-sm'
    : 'border border-solid a-border-border a-bg-layout a-color-text-secondary hover:a-bg-container'
}
</script>

<template>
  <div class="flex flex-col gap-3 border-b border-b-solid pb-4 a-border-b-border-sec">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="option in CATEGORY_OPTIONS"
          :key="option.key"
          type="button"
          class="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200"
          :class="buttonClass(category === option.key)"
          @click="category = option.key"
        >
          <span :class="option.icon" class="shrink-0 text-sm" />
          <span>{{ option.label }}</span>
          <span class="text-xs a-color-text-tertiary">{{ categoryCounts[option.key] ?? 0 }}</span>
        </button>
      </div>

      <a-input v-model:value="searchQuery" placeholder="搜索作物、来源标签..." allow-clear class="w-full lg:w-72">
        <template #prefix>
          <span class="i-streamline-emojis-magnifying-glass-tilted-left text-sm a-color-text-tertiary" />
        </template>
      </a-input>
    </div>

    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="option in STATUS_OPTIONS"
          :key="option.key"
          type="button"
          class="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200"
          :class="buttonClass(status === option.key)"
          @click="status = option.key"
        >
          <span :class="option.icon" class="shrink-0 text-sm" />
          <span>{{ option.label }}</span>
          <span class="text-xs a-color-text-tertiary">{{ statusCounts[option.key] ?? 0 }}</span>
        </button>
      </div>

      <div class="text-sm a-color-text-tertiary">
        当前显示 {{ filteredCount }} / {{ totalCount }} 项
      </div>
    </div>
  </div>
</template>
