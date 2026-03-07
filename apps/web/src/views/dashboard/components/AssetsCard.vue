<script setup lang="ts">
defineProps<{
  gold: number
  sessionGoldGained: number
  coupon: number
  sessionCouponGained: number
  uptime: number
}>()

function formatDuration(seconds: number): string {
  if (seconds <= 0)
    return '00:00:00'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (d > 0)
    return `${d}天 ${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
</script>

<template>
  <a-card
    variant="borderless"
    size="small"
    class="h-full"
    :classes="{ body: '!px-4 !py-3 !h-full !flex !flex-col !min-h-0' }"
  >
    <div class="flex-1 gap-3 grid grid-cols-2 min-h-0">
      <div class="p-2 flex flex-col items-center justify-center a-bg-layout rounded-lg">
        <div class="flex gap-1.5 items-center a-color-text-secondary">
          <div class="i-twemoji-coin" />
          金币
        </div>
        <div class="font-bold a-color-text text-xl">
          {{ gold || 0 }}
        </div>
        <div
          v-if="sessionGoldGained !== 0"
          class="flex gap-0.5 items-center justify-center"
          :class="sessionGoldGained > 0 ? 'a-color-success' : 'a-color-error'"
        >
          <span class="font-bold">{{ sessionGoldGained > 0 ? '↑' : '↓' }}</span>
          <span>{{ Math.abs(sessionGoldGained) }}</span>
        </div>
      </div>
      <div class="p-2 flex flex-col items-center justify-center a-bg-layout rounded-lg">
        <div class="flex gap-1.5 items-center a-color-text-secondary">
          <div class="i-twemoji-ticket" />
          点券
        </div>
        <div class="font-bold a-color-text text-xl">
          {{ coupon || 0 }}
        </div>
        <div
          v-if="sessionCouponGained !== 0"
          class="flex gap-0.5 items-center justify-center"
          :class="sessionCouponGained > 0 ? 'a-color-success' : 'a-color-error'"
        >
          <span class="font-bold">{{ sessionCouponGained > 0 ? '↑' : '↓' }}</span>
          <span>{{ Math.abs(sessionCouponGained) }}</span>
        </div>
      </div>
      <div class="px-3 py-1.5 flex gap-2 col-span-2 items-center justify-center a-bg-layout rounded-lg">
        <div class="i-twemoji-stopwatch text-lg" />
        <span class="a-color-text-secondary">挂机时长</span>
        <span class="font-bold font-mono a-color-primary">{{ formatDuration(uptime) }}</span>
      </div>
    </div>
  </a-card>
</template>
