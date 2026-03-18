<script setup lang="ts">
import type { SeedOption } from '@/api/modules/farm'

const props = defineProps<{
  seed: SeedOption
  imageError: boolean
}>()

const emit = defineEmits<{
  select: []
  imageError: []
}>()

function handleImageError(): void {
  emit('imageError')
}

function handleCardClick(): void {
  const { seed } = props
  if (!seed.locked && !seed.soldOut && seed.goodsId)
    emit('select')
}
</script>

<template>
  <div
    class="px-2 py-2 flex gap-3 transition-colors duration-200 items-center a-bg-layout rounded-lg"
    :class="seed.locked || seed.soldOut
      ? 'opacity-60 cursor-default'
      : ''"
  >
    <div class="flex shrink-0 h-11 w-11 items-center justify-center overflow-hidden a-bg-primary-bg rounded-lg">
      <img
        v-if="seed.image && !imageError"
        :src="seed.image"
        width="32"
        height="32"
        class="h-8 w-8 object-contain"
        loading="lazy"
        :alt="seed.name || '种子'"
        @error="handleImageError"
      >
      <span v-else class="font-bold a-color-text-tertiary text-sm">{{ (seed.name || '种').slice(0, 1) }}</span>
    </div>

    <div class="flex-1 min-w-0">
      <div class="font-medium truncate a-color-text text-sm" :title="seed.name">
        {{ seed.name || `种子${seed.seedId}` }}
      </div>
      <div class="mt-0.5 flex flex-wrap gap-2 items-center text-xs">
        <span class="flex gap-1 items-center a-color-warning">
          <span class="i-streamline-emojis-credit-card text-xs" />
          {{ seed.price ?? 0 }} 金币
        </span>
        <span v-if="(seed.requiredLevel ?? 0) > 0" class="inline-flex gap-0.5 items-center">
          <span class="i-streamline-emojis-seedling shrink-0 scale-80 text-xs" />
          <span>Lv.{{ seed.requiredLevel ?? 0 }}</span>
        </span>
        <span v-if="seed.locked" class="inline-flex shrink-0 gap-0.5 items-center" title="未解锁">
          <span class="i-streamline-emojis-locked-with-key text-xs" />
        </span>
        <span v-if="seed.soldOut" class="inline-flex shrink-0 gap-0.5 items-center" title="售罄">
          <span class="i-streamline-emojis-cross-mark text-xs" />
        </span>
      </div>
    </div>

    <a-button
      v-if="!seed.locked && !seed.soldOut && seed.goodsId"
      class="flex p-1.5!"
      type="text"
      @click="handleCardClick"
    >
      <span class="i-streamline-emojis-handbag text-lg" />
    </a-button>
  </div>
</template>
