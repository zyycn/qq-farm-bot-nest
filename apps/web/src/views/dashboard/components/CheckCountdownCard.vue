<script setup lang="ts">
defineProps<{
  nextFarmCheck: string
  nextFriendCheck: string
  /** QQ 账号时好友巡查临时关闭，仅展示文案不倒数 */
  friendPatrolDisabled?: boolean
}>()
</script>

<template>
  <a-card variant="borderless" :classes="{ body: '!p-4' }">
    <div class="mb-3 flex gap-2 items-center a-color-text">
      <div class="i-twemoji-alarm-clock text-lg" />
      巡查倒计时
    </div>
    <div class="flex flex-col gap-2.5">
      <div class="px-3 py-2.5 flex items-center justify-between a-bg-layout rounded-lg">
        <div class="flex gap-2 items-center">
          <div class="i-twemoji-seedling text-lg" />
          <span class="a-color-text">农场</span>
        </div>
        <span class="font-bold font-mono a-color-text">{{ nextFarmCheck }}</span>
      </div>
      <div class="px-3 py-2.5 flex items-center justify-between a-bg-layout rounded-lg">
        <div class="flex gap-2 items-center">
          <div class="i-twemoji-people-hugging text-lg" />
          <span class="a-color-text">好友</span>
        </div>
        <span
          class="font-mono a-color-text"
          :class="friendPatrolDisabled ? 'font-normal a-color-text-tertiary' : 'font-bold'"
        >
          {{ nextFriendCheck }}
        </span>
      </div>
    </div>
  </a-card>
</template>
