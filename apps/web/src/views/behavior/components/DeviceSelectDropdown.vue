<script setup lang="ts">
import type { DeviceSelectionOption } from '@/api/types'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useDeviceStore } from '@/stores'

const props = withDefaults(defineProps<{
  modelValue: string | null
  disabled?: boolean
  includeGlobalOption?: boolean
}>(), {
  disabled: false,
  includeGlobalOption: true
})

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const GLOBAL_DEVICE_VALUE = '__global_default_device__'

const deviceStore = useDeviceStore()
const { customProfiles, loading, presets, selectionOptions } = storeToRefs(deviceStore)

const options = computed<DeviceSelectionOption[]>(() => {
  const base: DeviceSelectionOption[] = props.includeGlobalOption
    ? [{ label: '跟随全局默认设备', value: GLOBAL_DEVICE_VALUE }]
    : []
  return [...base, ...selectionOptions.value]
})

const selectedValue = computed<string | undefined>({
  get: () => props.modelValue ?? GLOBAL_DEVICE_VALUE,
  set: value => emit('update:modelValue', !value || value === GLOBAL_DEVICE_VALUE ? null : value)
})

onMounted(() => {
  if (!presets.value.length && !customProfiles.value.length)
    deviceStore.loadAll().catch(() => {})
})
</script>

<template>
  <a-select
    v-model:value="selectedValue"
    :options="options"
    :loading="loading"
    :disabled="disabled"
    placeholder="选择当前账号要使用的设备配置"
    allow-clear
  />
</template>
