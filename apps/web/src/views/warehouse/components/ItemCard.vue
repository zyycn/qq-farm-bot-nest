<script setup lang="ts">
import type { BagItem } from '@/api/types'

defineProps<{
  item: BagItem
  selling: boolean
  imageError: boolean
}>()

const emit = defineEmits<{
  sell: []
  imageError: []
}>()

const CATEGORY_ICON: Record<string, string> = {
  fruit: 'i-streamline-emojis-red-apple',
  seed: 'i-streamline-emojis-seedling',
  item: 'i-streamline-emojis-wrench'
}

function categoryIcon(category: string): string {
  return CATEGORY_ICON[category || 'item'] ?? 'i-streamline-emojis-file-folder'
}

function handleImageError(): void {
  emit('imageError')
}
</script>

<template>
  <div class="px-2 py-2 flex gap-3 transition-colors duration-200 items-center a-bg-layout rounded-lg">
    <div class="flex shrink-0 h-11 w-11 items-center justify-center overflow-hidden a-bg-primary-bg rounded-lg">
      <img
        v-if="item.image && !imageError"
        :src="item.image"
        class="h-8 w-8 object-contain"
        loading="lazy"
        :alt="item.name || '物品'"
        @error="handleImageError"
      >
      <span v-else class="font-bold a-color-text-tertiary text-sm">{{ (item.name || '物').slice(0, 1) }}</span>
    </div>

    <div class="flex flex-1 flex-col gap-1 min-w-0 justify-between">
      <div class="font-medium truncate a-color-text text-sm" :title="item.name">
        {{ item.name || `物品${item.id}` }}
      </div>
      <div class="flex gap-1.5 items-center a-color-text-tertiary text-xs">
        <span :class="categoryIcon(item.category || '')" class="shrink-0" />
        {{ item.hoursText || `x${item.count ?? 0}` }}
      </div>
    </div>

    <a-button
      v-if="(item.price ?? 0) > 0 && (item.count ?? 0) > 0"
      class="flex shrink-0 p-1.5!"
      type="text"
      :disabled="selling"
      @click="emit('sell')"
    >
      <span class="i-streamline-emojis-dollar-banknote text-lg" />
    </a-button>
  </div>
</template>
