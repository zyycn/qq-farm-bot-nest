<script setup lang="ts">
import type { ModalProps } from 'antdv-next'
import type { DeviceEditSubmitPayload } from '../device-form'
import type { DevicePreset, StoredDeviceProfile } from '@/api/types'
import { computed, reactive, watch } from 'vue'
import {
  applyPresetToDeviceForm,
  applyProfileToDeviceForm,
  createDeviceFormState,
  resetDeviceForm,
  toCreateDeviceProfilePayload,
  toUpdateDeviceProfilePayload
} from '../device-form'

const props = withDefaults(defineProps<{
  open: boolean
  preset?: DevicePreset | null
  profile?: StoredDeviceProfile | null
  submitting?: boolean
}>(), {
  preset: null,
  profile: null,
  submitting: false
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'submit': [payload: DeviceEditSubmitPayload]
}>()

const modalOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value)
})

const modalStyles: ModalProps['styles'] = {
  body: {
    maxHeight: 'calc(100dvh - 380px)',
    overflowY: 'auto',
    overscrollBehavior: 'contain'
  }
}

const form = reactive(createDeviceFormState())

const isEditing = computed(() => Boolean(props.profile?.id))
const title = computed(() => {
  if (isEditing.value)
    return '编辑设备'
  if (props.preset)
    return `基于 ${props.preset.name} 创建设备`
  return '新建设备'
})

watch(
  () => [props.open, props.profile?.id, props.preset?.id],
  ([open]) => {
    if (!open)
      return

    if (props.profile) {
      applyProfileToDeviceForm(form, props.profile)
      return
    }

    if (props.preset) {
      applyPresetToDeviceForm(form, props.preset)
      return
    }

    resetDeviceForm(form)
  },
  { immediate: true }
)

function handleSubmit(): void {
  if (isEditing.value && props.profile) {
    emit('submit', {
      type: 'update',
      id: props.profile.id,
      data: toUpdateDeviceProfilePayload(form)
    })
    return
  }

  emit('submit', {
    type: 'create',
    data: toCreateDeviceProfilePayload(form)
  })
}
</script>

<template>
  <a-modal
    v-model:open="modalOpen"
    :title="title"
    width="700px"
    :styles="modalStyles"
    :confirm-loading="submitting"
    centered
    @ok="handleSubmit"
  >
    <a-form layout="vertical">
      <a-form-item label="名称">
        <a-input v-model:value="form.name" />
      </a-form-item>

      <div class="font-semibold mb-2 mt-4">
        连接参数
      </div>
      <div class="gap-x-4 grid grid-cols-1 md:grid-cols-2">
        <a-form-item label="Server URL">
          <a-input v-model:value="form.serverUrl" />
        </a-form-item>
        <a-form-item label="客户端版本">
          <a-input v-model:value="form.clientVersion" />
        </a-form-item>
        <a-form-item label="Platform">
          <a-select v-model:value="form.platform">
            <a-select-option value="qq">
              qq
            </a-select-option>
            <a-select-option value="wx">
              wx
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="OS">
          <a-select v-model:value="form.os">
            <a-select-option value="iOS">
              iOS
            </a-select-option>
            <a-select-option value="android">
              android
            </a-select-option>
            <a-select-option value="windows">
              windows
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="网络类型">
          <a-select v-model:value="form.network">
            <a-select-option value="wifi">
              wifi
            </a-select-option>
            <a-select-option value="4g">
              4g
            </a-select-option>
            <a-select-option value="5g">
              5g
            </a-select-option>
            <a-select-option value="ethernet">
              ethernet
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="运营商">
          <a-input v-model:value="form.telecomOper" />
        </a-form-item>
      </div>

      <div class="font-semibold mb-2 mt-4">
        设备信息
      </div>
      <div class="gap-x-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        <a-form-item label="系统版本">
          <a-input v-model:value="form.sysSoftware" />
        </a-form-item>
        <a-form-item label="硬件型号">
          <a-input v-model:value="form.sysHardware" />
        </a-form-item>
        <a-form-item label="CPU">
          <a-input v-model:value="form.cpu" />
        </a-form-item>
        <a-form-item label="屏幕宽度">
          <a-input-number v-model:value="form.screenWidth" :min="0" class="w-full" />
        </a-form-item>
        <a-form-item label="屏幕高度">
          <a-input-number v-model:value="form.screenHeight" :min="0" class="w-full" />
        </a-form-item>
        <a-form-item label="屏幕密度">
          <a-input-number v-model:value="form.density" :min="0" :step="0.5" class="w-full" />
        </a-form-item>
        <a-form-item label="内存 (MB)">
          <a-input-number v-model:value="form.memory" :min="0" class="w-full" />
        </a-form-item>
        <a-form-item label="GL Render">
          <a-input v-model:value="form.glRender" />
        </a-form-item>
        <a-form-item label="GL Version">
          <a-input v-model:value="form.glVersion" />
        </a-form-item>
        <a-form-item label="设备 ID">
          <a-input v-model:value="form.deviceId" />
        </a-form-item>
        <a-form-item label="Android OAID">
          <a-input v-model:value="form.androidOaid" />
        </a-form-item>
        <a-form-item label="iOS CAID">
          <a-input v-model:value="form.iosCaid" />
        </a-form-item>
      </div>

      <div class="font-semibold mb-2 mt-4">
        HTTP Headers
      </div>
      <div class="gap-x-4 grid grid-cols-1 md:grid-cols-2">
        <a-form-item label="Origin">
          <a-input v-model:value="form.origin" />
        </a-form-item>
        <a-form-item label="User-Agent" class="md:col-span-2">
          <a-textarea v-model:value="form.userAgent" :rows="3" />
        </a-form-item>
      </div>
    </a-form>
  </a-modal>
</template>
