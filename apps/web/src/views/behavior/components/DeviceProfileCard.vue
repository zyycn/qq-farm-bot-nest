<script setup lang="ts">
import type { StoredDeviceProfile } from '@/api/modules/device'
import { computed } from 'vue'

const props = defineProps<{
  profile: StoredDeviceProfile
}>()

const emit = defineEmits<{
  edit: [profile: StoredDeviceProfile]
  delete: [id: string]
}>()

const updatedAtLabel = computed(() => {
  if (!props.profile.updatedAt)
    return '刚刚创建'
  return new Date(props.profile.updatedAt).toLocaleString('zh-CN')
})
</script>

<template>
  <a-card size="small" class="w-full md:w-80">
    <div class="flex gap-3 items-start justify-between">
      <div class="flex-1 min-w-0">
        <div class="font-medium break-words">
          {{ profile.name }}
        </div>
        <div class="mt-2 flex flex-wrap gap-2">
          <a-tag>{{ profile.profile.os || '未设置系统' }}</a-tag>
          <a-tag v-if="profile.presetId">
            源自预设
          </a-tag>
        </div>
      </div>
    </div>

    <div class="mt-3 space-y-1 text-sm">
      <div class="flex gap-2">
        <span class="shrink-0 a-color-text-tertiary text-xs">系统</span>
        <span class="min-w-0 truncate" :title="profile.profile.sysSoftware || '-'">
          {{ profile.profile.sysSoftware || '-' }}
        </span>
      </div>
      <div class="flex gap-2">
        <span class="shrink-0 a-color-text-tertiary text-xs">型号</span>
        <span class="min-w-0 truncate" :title="profile.profile.sysHardware || '-'">
          {{ profile.profile.sysHardware || '-' }}
        </span>
      </div>
      <div class="a-color-text-tertiary text-xs">
        最近更新：{{ updatedAtLabel }}
      </div>
    </div>

    <div class="mt-3 flex gap-2">
      <a-button size="small" @click="emit('edit', profile)">
        编辑
      </a-button>
      <a-popconfirm title="确认删除这个设备配置？" @confirm="emit('delete', profile.id)">
        <a-button size="small" danger>
          删除
        </a-button>
      </a-popconfirm>
    </div>
  </a-card>
</template>
