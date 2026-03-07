<script setup lang="ts">
import QqAvatar from '@/components/QqAvatar.vue'
import { getPlatformIcon } from '@/utils/platform'

defineProps<{
  collapsed?: boolean
  displayInfo: { primary: string, secondary: string }
  connectionStatus: { text: string, badge: 'error' | 'default' | 'processing' }
  accountOptions: any[]
  currentAccount: any
}>()

const emit = defineEmits<{
  openRemark: []
  addAccount: []
}>()

const selectedAccountId = defineModel<any>('selectedAccountId', { required: true })
</script>

<template>
  <!-- Expanded -->
  <div v-if="!collapsed" class="px-3 py-3">
    <div class="border-solid overflow-hidden a-border-border-sec border rounded-xl shadow-sm">
      <div class="px-3 py-2.5 flex gap-3 items-center a-bg-primary-bg">
        <QqAvatar :src="currentAccount?.avatar" :uin="currentAccount?.uin" :size="40" ring :platform="currentAccount?.platform" />

        <div class="flex flex-1 flex-col gap-0.5 min-w-0">
          <div class="leading-snug font-semibold truncate a-color-text">
            {{ displayInfo.primary }}
          </div>
          <div class="leading-snug truncate a-color-text-tertiary text-sm">
            {{ displayInfo.secondary }}
          </div>
        </div>
        <a-badge :status="connectionStatus.badge" />
      </div>
      <div class="px-3 py-2">
        <a-select
          v-if="accountOptions.length"
          v-model:value="selectedAccountId"
          :options="accountOptions"
          placeholder="切换账号..."
          size="small"
          class="w-full h-6!"
        >
          <template #optionRender="{ option }">
            <div class="flex gap-1 items-center">
              <i class="text-primary" :class="getPlatformIcon(option.data?.platform)" />
              <QqAvatar :src="option.data?.avatar" :uin="option.data?.uin" :size="18" />
              <span>{{ option.data?.label }}</span>
            </div>
          </template>
        </a-select>
        <div v-else class="py-1 text-center a-color-text-tertiary text-sm">
          暂无账号
        </div>
        <div class="mt-1.5 flex items-center justify-between">
          <a-button
            size="small"
            type="link"
            class="!px-0 !text-sm"
            :disabled="!currentAccount"
            @click="emit('openRemark')"
          >
            修改备注
          </a-button>
          <a-button size="small" type="link" class="!px-0 !text-sm" @click="emit('addAccount')">
            + 添加账号
          </a-button>
        </div>
      </div>
    </div>
  </div>

  <!-- Collapsed -->
  <div v-else class="py-3 flex justify-center">
    <QqAvatar :src="currentAccount?.avatar" :uin="currentAccount?.uin" :size="36" ring />
  </div>
</template>
