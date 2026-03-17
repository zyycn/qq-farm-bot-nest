<script setup lang="ts">
import type { BagItem } from '@/api/types'

defineProps<{
  fertilizerNormal: BagItem | undefined
  fertilizerOrganic: BagItem | undefined
  collectionNormal: BagItem | undefined
  collectionRare: BagItem | undefined
}>()

function formatBucketTime(item: BagItem | undefined): string {
  if (!item)
    return '0.0h'
  if (item.hoursText)
    return item.hoursText.replace('小时', 'h')
  const count = Number(item.count || 0)
  return `${(count / 3600).toFixed(1)}h`
}
</script>

<template>
  <a-card variant="borderless" size="small" class="h-full" :classes="{ body: '!px-4 !py-3 !h-full' }">
    <div class="gap-2 grid grid-cols-4 h-full">
      <div class="px-2 py-3 flex flex-col gap-1.5 items-center justify-center a-bg-layout rounded-lg">
        <div class="i-streamline-emojis-droplet text-2xl" />
        <span class="text-center a-color-text-secondary text-sm">普通化肥</span>
        <span class="font-bold a-color-text">{{ formatBucketTime(fertilizerNormal) }}</span>
      </div>
      <div class="px-2 py-3 flex flex-col gap-1.5 items-center justify-center a-bg-layout rounded-lg">
        <div class="i-streamline-emojis-herb text-2xl" />
        <span class="text-center a-color-text-secondary text-sm">有机化肥</span>
        <span class="font-bold a-color-text">{{ formatBucketTime(fertilizerOrganic) }}</span>
      </div>
      <div class="px-2 py-3 flex flex-col gap-1.5 items-center justify-center a-bg-layout rounded-lg">
        <div class="i-streamline-emojis-four-leaf-clover text-2xl" />
        <span class="text-center a-color-text-secondary text-sm">普通收藏</span>
        <span class="font-bold a-color-text">{{ collectionNormal?.count || 0 }}</span>
      </div>
      <div class="px-2 py-3 flex flex-col gap-1.5 items-center justify-center a-bg-layout rounded-lg">
        <div class="i-streamline-emojis-diamond-suit text-2xl" />
        <span class="text-center a-color-text-secondary text-sm">典藏收藏</span>
        <span class="font-bold a-color-text">{{ collectionRare?.count || 0 }}</span>
      </div>
    </div>
  </a-card>
</template>
