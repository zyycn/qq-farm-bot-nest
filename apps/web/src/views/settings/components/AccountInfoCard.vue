<script setup lang="ts">
import QqAvatar from '@/components/QqAvatar.vue'

defineProps<{
  accountId: string | null
  accountName: string | null
  accountUin?: string | number
  accountAvatar?: string
}>()
</script>

<template>
  <a-card variant="borderless" class="shrink-0" :classes="{ body: '!px-4 !py-3' }">
    <div v-if="accountId" class="flex gap-4 items-center">
      <QqAvatar :src="accountAvatar" :uin="accountUin" :size="44" ring />
      <div class="flex-1 min-w-0">
        <div class="flex gap-2 items-center">
          <span class="font-bold truncate a-color-text">{{ accountName }}</span>
        </div>
        <div class="mt-0.5 a-color-text-tertiary text-sm">
          UIN: {{ accountUin || '-' }}
        </div>
      </div>
    </div>
    <div v-else class="py-1 flex gap-3 items-center">
      <div class="i-twemoji-gear opacity-40 text-2xl" />
      <div>
        <div class="a-color-text-secondary">
          未选择账号
        </div>
        <div class="a-color-text-tertiary text-sm">
          请先在侧边栏选择一个账号来配置设置
        </div>
      </div>
    </div>
  </a-card>
</template>
