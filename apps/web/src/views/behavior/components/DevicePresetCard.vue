<script setup lang="ts">
import type { DevicePreset } from '@/api/modules/device'

defineProps<{
  preset: DevicePreset
}>()

const emit = defineEmits<{
  create: [preset: DevicePreset]
}>()
</script>

<template>
  <a-card size="small" class="w-full md:w-72" hoverable>
    <div class="space-y-3">
      <div class="font-medium break-words">
        {{ preset.name }}
      </div>

      <div class="space-y-2 text-sm">
        <div class="flex gap-2">
          <span class="shrink-0 a-color-text-tertiary text-xs">系统</span>
          <span class="min-w-0 truncate" :title="preset.profile.sysSoftware || '-'">
            {{ preset.profile.sysSoftware || '-' }}
          </span>
        </div>
        <div class="flex gap-2">
          <span class="shrink-0 a-color-text-tertiary text-xs">型号</span>
          <span class="min-w-0 truncate" :title="preset.profile.sysHardware || '-'">
            {{ preset.profile.sysHardware || '-' }}
          </span>
        </div>
      </div>

      <a-button size="small" type="link" class="px-0" @click="emit('create', preset)">
        基于此创建设备
      </a-button>
    </div>
  </a-card>
</template>
