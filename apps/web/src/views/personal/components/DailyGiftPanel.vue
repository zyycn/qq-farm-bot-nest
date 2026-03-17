<script setup lang="ts">
import type { DailyGift } from '@/api/types'
import EmptyState from '@/components/EmptyState.vue'

defineProps<{
  gifts: DailyGift[]
}>()

const GIFT_ICONS: Record<string, string> = {
  task_claim: 'i-streamline-emojis-ballot-box-with-check',
  email_rewards: 'i-streamline-emojis-e-mail-1',
  mall_free_gifts: 'i-streamline-emojis-confetti-ball',
  daily_share: 'i-streamline-emojis-speaking-head',
  vip_daily_gift: 'i-streamline-emojis-crown',
  month_card_gift: 'i-streamline-emojis-calendar',
  open_server_gift: 'i-streamline-emojis-wrapped-gift-1'
}

function getGiftIcon(key: string) {
  return GIFT_ICONS[key] || 'i-streamline-emojis-wrapped-gift-1'
}

function getGiftStatus(gift: DailyGift) {
  if (gift.key === 'vip_daily_gift' && gift.hasGift === false)
    return { text: '未开通', color: 'default' as const }
  if (gift.key === 'month_card_gift' && gift.hasCard === false)
    return { text: '未开通', color: 'default' as const }
  if (gift.doneToday)
    return { text: '已完成', color: 'green' as const }
  if (gift.enabled)
    return { text: '等待中', color: 'blue' as const }
  return { text: '未开启', color: 'default' as const }
}
</script>

<template>
  <a-card variant="borderless" size="small" :classes="{ body: '!p-3' }">
    <div class="font-bold mb-2 flex gap-2 items-center a-color-text">
      <div class="i-streamline-emojis-wrapped-gift-1" />
      每日礼包
    </div>
    <div v-if="gifts.length" class="gap-1.5 grid grid-cols-2">
      <div
        v-for="gift in gifts"
        :key="gift.key"
        class="px-2 py-1.5 flex gap-2 items-center rounded-lg"
        :class="gift.doneToday ? 'a-bg-primary-bg' : 'a-bg-layout'"
      >
        <div class="shrink-0" :class="getGiftIcon(gift.key)" />
        <div class="flex-1 min-w-0">
          <div class="leading-tight mb-0.5 truncate a-color-text text-sm">
            {{ gift.label }}
          </div>
          <div class="text-sm" :class="gift.doneToday ? 'a-color-success' : 'a-color-text-tertiary'">
            {{ getGiftStatus(gift).text }}
          </div>
        </div>
      </div>
    </div>
    <EmptyState v-else icon="i-streamline-emojis-wrapped-gift-1 text-3xl mt-4" description="暂无数据" />
  </a-card>
</template>
