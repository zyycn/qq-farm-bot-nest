<script setup lang="ts">
import type { DailyGift, DailyGiftTask } from '@/api/types'
import EmptyState from '@/components/EmptyState.vue'

defineProps<{
  growth: DailyGift | null
}>()

function formatTaskProgress(task: DailyGiftTask | undefined) {
  if (!task)
    return '未开始'
  const current = Number(task.progress ?? task.current) || 0
  const target = Number(task.totalProgress ?? task.target) || 0
  if (!current && !target)
    return '未开始'
  if (target && current >= target)
    return '已完成'
  return `${current}/${target}`
}
</script>

<template>
  <a-card variant="borderless" size="small" :classes="{ body: '!p-3' }">
    <div class="mb-2 flex items-center justify-between">
      <div class="font-bold flex gap-2 items-center a-color-text">
        <div class="i-streamline-emojis-clipboard" />
        成长任务
      </div>
      <a-tag v-if="growth" :color="growth.doneToday ? 'green' : 'blue'" size="small">
        {{ growth.doneToday ? '已完成' : `${growth.completedCount}/${growth.totalCount}` }}
      </a-tag>
    </div>
    <div v-if="growth?.tasks?.length" class="space-y-1">
      <div
        v-for="(task, idx) in growth.tasks"
        :key="idx"
        class="px-2.5 py-1.5 flex items-center justify-between a-bg-layout rounded-lg"
      >
        <span class="truncate a-color-text-secondary text-sm">{{ task.desc || task.name }}</span>
        <a-tag :color="formatTaskProgress(task) === '已完成' ? 'green' : 'default'" size="small" class="shrink-0 !ml-2">
          {{ formatTaskProgress(task) }}
        </a-tag>
      </div>
    </div>
    <EmptyState v-else icon="i-streamline-emojis-clipboard text-3xl mt-4" description="暂无任务" />
  </a-card>
</template>
