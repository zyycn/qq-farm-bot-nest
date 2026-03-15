<script setup lang="ts">
defineProps<{
  nextFarmCheck: string
  nextFriendCheck: string
}>()
</script>

<template>
  <a-card variant="borderless" :classes="{ body: '!p-4' }">
    <div class="mb-3 flex gap-2 items-center a-color-text">
      <div class="i-twemoji-alarm-clock" />
      <span>主动巡查</span>
    </div>
    <div class="flex flex-col gap-2.5">
      <div class="px-3 py-2.5 flex items-center justify-between a-bg-layout rounded-lg">
        <div class="flex gap-2 items-center">
          <div class="i-streamline-emojis-seedling text-lg" />
          <span class="a-color-text">农场</span>
        </div>
        <span class="font-bold font-mono a-color-text">{{ nextFarmCheck }}</span>
      </div>
      <div class="px-3 py-2.5 flex items-center justify-between a-bg-layout rounded-lg">
        <div class="flex gap-2 items-center">
          <div class="i-streamline-emojis-man-and-woman-holding-hands-1 text-lg" />
          <span class="a-color-text">好友</span>
        </div>
        <span class="font-bold font-mono a-color-text">{{ nextFriendCheck }}</span>
      </div>
    </div>
  </a-card>
</template>
