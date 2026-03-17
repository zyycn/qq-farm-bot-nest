<script setup lang="ts">
import type { BagItem } from '@/api/types'
import { ref } from 'vue'
import EmptyState from '@/components/EmptyState.vue'

defineProps<{
  items: BagItem[]
}>()

const imageErrors = ref<Record<string | number, boolean>>({})

function onImageError(id: string | number) {
  imageErrors.value[id] = true
}
</script>

<template>
  <a-card
    variant="borderless"
    size="small"
    class="flex-1 overflow-hidden"
    :classes="{ body: '!p-3 !h-full !flex !flex-col !overflow-hidden' }"
  >
    <div class="mb-2 flex items-center justify-between">
      <div class="font-bold flex gap-2 items-center a-color-text">
        <div class="i-streamline-emojis-package" />
        仓库
      </div>
      <span v-if="items.length" class="a-color-text-tertiary text-sm">{{ items.length }} 种</span>
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto">
      <div v-if="!items.length" class="flex h-full items-center justify-center">
        <EmptyState icon="i-streamline-emojis-package text-3xl" description="背包空空" />
      </div>
      <div v-else class="space-y-1">
        <div
          v-for="item in items"
          :key="item.id"
          class="px-2.5 py-1.5 flex gap-2.5 items-center a-bg-layout rounded-lg"
        >
          <div class="flex shrink-0 h-8 w-8 items-center justify-center overflow-hidden a-bg-container rounded-lg">
            <img
              v-if="item.image && !imageErrors[item.id]"
              :src="item.image"
              class="h-6 w-6 object-contain"
              loading="lazy"
              @error="onImageError(item.id)"
            >
            <span v-else class="font-bold a-color-text-tertiary text-sm">{{ (item.name || '物').slice(0, 1) }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="leading-tight truncate a-color-text text-sm">
              {{ item.name || `物品${item.id}` }}
            </div>
            <div class="a-color-text-tertiary text-xs">
              {{ item.hoursText || `x${item.count || 0}` }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </a-card>
</template>
