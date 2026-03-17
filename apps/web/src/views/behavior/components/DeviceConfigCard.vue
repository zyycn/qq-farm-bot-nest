<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useDeviceStore, useStrategyStore } from '@/stores'
import DeviceSelectDropdown from './DeviceSelectDropdown.vue'

const strategyStore = useStrategyStore()
const deviceStore = useDeviceStore()

const { settings } = storeToRefs(strategyStore)
const selectedDevice = computed(() => deviceStore.resolveSelection(settings.value.deviceProfileId))

const selectedSummary = computed(() => {
  const profile = selectedDevice.value?.profile
  if (!profile)
    return null

  return {
    os: profile.os || '-',
    sysSoftware: profile.sysSoftware || '-',
    sysHardware: profile.sysHardware || '-'
  }
})
</script>

<template>
  <a-card variant="borderless" class="shrink-0" :classes="{ body: '!p-4', header: '!min-h-11 !px-4' }">
    <template #title>
      <div class="font-bold flex gap-2 items-center">
        <div class="i-streamline-emojis-computer-disk" />
        设备配置
      </div>
    </template>

    <fieldset>
      <legend class="tracking-wide font-medium mb-2 op-50 uppercase text-xs">
        当前账号设备
      </legend>
      <a-form layout="vertical">
        <a-form-item label="设备来源">
          <DeviceSelectDropdown v-model="settings.deviceProfileId" />
        </a-form-item>
      </a-form>
      <div class="a-color-text-tertiary text-sm">
        不选择时会跟随全局默认设备；选择预设或自定义设备后，仅当前账号生效。
      </div>
    </fieldset>

    <fieldset>
      <legend class="tracking-wide font-medium mb-2 op-50 uppercase text-xs">
        设备预览
      </legend>
      <div v-if="selectedDevice" class="gap-x-4 gap-y-3 grid grid-cols-1 md:grid-cols-2">
        <div>
          <div class="a-color-text-tertiary text-xs">
            来源
          </div>
          <div>{{ selectedDevice.source === 'preset' ? '内置预设' : '自定义配置' }}</div>
        </div>
        <div>
          <div class="a-color-text-tertiary text-xs">
            名称
          </div>
          <div>{{ selectedDevice.name }}</div>
        </div>
        <div>
          <div class="a-color-text-tertiary text-xs">
            OS
          </div>
          <div>{{ selectedSummary?.os }}</div>
        </div>
        <div>
          <div class="a-color-text-tertiary text-xs">
            系统版本
          </div>
          <div>{{ selectedSummary?.sysSoftware }}</div>
        </div>
        <div>
          <div class="a-color-text-tertiary text-xs">
            硬件型号
          </div>
          <div>{{ selectedSummary?.sysHardware }}</div>
        </div>
      </div>
      <div v-else class="a-color-text-tertiary text-sm">
        当前跟随全局默认设备，详细参数请在下方设备管理中维护。
      </div>
    </fieldset>
  </a-card>
</template>
