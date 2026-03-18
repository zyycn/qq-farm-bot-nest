<script setup lang="ts">
import type { DeviceEditSubmitPayload } from '../device-form'
import type { DevicePreset, ResolvedDeviceSelection, StoredDeviceProfile } from '@/api/modules/device'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useDeviceStore } from '@/stores'
import message from '@/utils/message'
import DeviceEditModal from './DeviceEditModal.vue'
import DevicePresetCard from './DevicePresetCard.vue'
import DeviceProfileCard from './DeviceProfileCard.vue'
import DeviceSelectDropdown from './DeviceSelectDropdown.vue'

const deviceStore = useDeviceStore()
const { presets, customProfiles, defaultDeviceProfileId, loading } = storeToRefs(deviceStore)

const showModal = ref(false)
const submitting = ref(false)
const savingDefault = ref(false)
const activePreset = ref<DevicePreset | null>(null)
const editingProfile = ref<StoredDeviceProfile | null>(null)
const selectedPresetCategory = ref<DevicePreset['category']>('ios')
const hasManualPresetCategorySelection = ref(false)
const defaultProfileIdDraft = ref<string | null>(null)

const presetGroupLabelMap: Record<DevicePreset['category'], string> = {
  ios: 'iOS',
  android: 'Android',
  windows: 'Windows'
}

interface PresetGroup {
  key: DevicePreset['category']
  label: string
  items: DevicePreset[]
}

const presetCategories: DevicePreset['category'][] = ['ios', 'android', 'windows']

const presetGroups = computed<PresetGroup[]>(() =>
  presetCategories.map(category => ({
    key: category,
    label: presetGroupLabelMap[category],
    items: presets.value.filter(item => item.category === category)
  }))
)

const presetCategoryOptions = computed(() =>
  presetGroups.value.map(group => ({
    label: group.label,
    value: group.key
  }))
)

const activePresetGroup = computed(() =>
  presetGroups.value.find(group => group.key === selectedPresetCategory.value) ?? presetGroups.value[0]
)

const defaultSelectedDevice = computed<ResolvedDeviceSelection | null>(() =>
  deviceStore.resolveSelection(defaultProfileIdDraft.value)
)

const defaultSelectedCustomProfile = computed<StoredDeviceProfile | null>(() => {
  const selection = defaultSelectedDevice.value
  if (!selection || selection.source !== 'custom')
    return null
  return deviceStore.findCustomProfileById(selection.id) ?? null
})

const defaultSelectedPreset = computed<DevicePreset | null>(() => {
  const selection = defaultSelectedDevice.value
  if (!selection || selection.source !== 'preset')
    return null
  return deviceStore.findPresetById(selection.id) ?? null
})

watch(
  presetGroups,
  (groups) => {
    if (hasManualPresetCategorySelection.value)
      return

    selectedPresetCategory.value = groups.find(group => group.items.length)?.key ?? 'ios'
  },
  { immediate: true }
)

watch(
  defaultDeviceProfileId,
  value => defaultProfileIdDraft.value = value,
  { immediate: true }
)

function openCreate(preset?: DevicePreset): void {
  activePreset.value = preset ?? null
  editingProfile.value = null
  showModal.value = true
}

function handlePresetCategoryChange(): void {
  hasManualPresetCategorySelection.value = true
}

function openEdit(profile: StoredDeviceProfile): void {
  editingProfile.value = profile
  activePreset.value = null
  showModal.value = true
}

function openDefaultDeviceEditor(): void {
  if (defaultSelectedCustomProfile.value) {
    openEdit(defaultSelectedCustomProfile.value)
    return
  }

  if (defaultSelectedPreset.value)
    openCreate(defaultSelectedPreset.value)
}

function closeModal(): void {
  showModal.value = false
  activePreset.value = null
  editingProfile.value = null
}

async function handleSave(payload: DeviceEditSubmitPayload): Promise<void> {
  submitting.value = true
  try {
    if (payload.type === 'create') {
      await deviceStore.createProfile(payload.data)
      message.success('设备配置已创建')
    } else {
      await deviceStore.updateProfile(payload.id, payload.data)
      message.success('设备配置已更新')
    }
    closeModal()
  } catch (error: unknown) {
    const err = error as { message?: string }
    message.error(err?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(id: string): Promise<void> {
  try {
    await deviceStore.deleteProfile(id)
    message.success('设备配置已删除')
  } catch (error: unknown) {
    const err = error as { message?: string }
    message.error(err?.message || '删除失败')
  }
}

async function handleSaveDefault(): Promise<void> {
  savingDefault.value = true
  try {
    await deviceStore.setDefaultProfileId(defaultProfileIdDraft.value)
    message.success(defaultProfileIdDraft.value ? '全局默认设备已更新' : '已清除全局默认设备')
  } catch (error: unknown) {
    const err = error as { message?: string }
    message.error(err?.message || '保存默认设备失败')
  } finally {
    savingDefault.value = false
  }
}
</script>

<template>
  <a-card
    id="device-management"
    variant="borderless"
    class="shrink-0"
    :classes="{ body: '!p-4', header: '!min-h-11 !px-4' }"
  >
    <template #title>
      <div class="font-bold flex gap-2 items-center">
        <div class="i-streamline-emojis-computer-disk" />
        设备管理
      </div>
    </template>

    <template #extra>
      <a-button type="primary" size="small" :loading="loading" @click="openCreate()">
        新建设备
      </a-button>
    </template>

    <div class="space-y-5">
      <fieldset>
        <legend class="tracking-wide font-medium mb-2 op-50 uppercase text-xs">
          全局默认设备
        </legend>
        <div class="space-y-3!">
          <DeviceSelectDropdown v-model="defaultProfileIdDraft" :include-global-option="false" />
          <div class="flex gap-2 items-center">
            <a-button type="primary" size="small" :loading="savingDefault" @click="handleSaveDefault">
              保存默认设备
            </a-button>
            <a-button size="small" :disabled="!defaultProfileIdDraft" @click="defaultProfileIdDraft = null">
              清空选择
            </a-button>
            <a-button
              v-if="defaultSelectedDevice"
              size="small"
              @click="openDefaultDeviceEditor"
            >
              {{ defaultSelectedDevice.source === 'custom' ? '编辑默认设备参数' : '基于默认预设新建设备' }}
            </a-button>
          </div>
          <div class="a-color-text-tertiary text-sm">
            未为账号单独指定设备时，将优先使用这里的默认设备；若这里也为空，则回退到内置默认预设。
          </div>
          <div
            v-if="defaultSelectedDevice"
            class="p-3 bg-[rgba(0,0,0,0.03)] gap-x-4 gap-y-3 grid grid-cols-1 text-sm rounded-lg md:grid-cols-2"
          >
            <div>
              <div class="a-color-text-tertiary text-xs">
                当前默认来源
              </div>
              <div>
                {{ defaultSelectedDevice.source === 'custom' ? '自定义设备' : '内置预设' }}
              </div>
            </div>
            <div>
              <div class="a-color-text-tertiary text-xs">
                名称
              </div>
              <div>{{ defaultSelectedDevice.name }}</div>
            </div>
            <div>
              <div class="a-color-text-tertiary text-xs">
                平台 / OS
              </div>
              <div>{{ defaultSelectedDevice.profile.platform || '-' }} / {{ defaultSelectedDevice.profile.os || '-' }}</div>
            </div>
            <div>
              <div class="a-color-text-tertiary text-xs">
                硬件型号
              </div>
              <div>{{ defaultSelectedDevice.profile.sysHardware || '-' }}</div>
            </div>
            <div>
              <div class="a-color-text-tertiary text-xs">
                客户端版本
              </div>
              <div>{{ defaultSelectedDevice.profile.clientVersion || '-' }}</div>
            </div>
            <div>
              <div class="a-color-text-tertiary text-xs">
                系统版本
              </div>
              <div>{{ defaultSelectedDevice.profile.sysSoftware || '-' }}</div>
            </div>
            <div class="md:col-span-2">
              <div class="a-color-text-tertiary text-xs">
                User-Agent
              </div>
              <div class="truncate">
                {{ defaultSelectedDevice.profile.userAgent || '-' }}
              </div>
            </div>
          </div>
          <div v-else class="a-color-text-tertiary text-sm">
            当前未设置全局默认设备，未单独指定设备的账号会使用内置默认预设。
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend class="tracking-wide font-medium mb-2 op-50 uppercase text-xs">
          内置设备预设
        </legend>
        <div class="space-y-3!">
          <a-segmented
            v-model:value="selectedPresetCategory"
            :options="presetCategoryOptions"
            @change="handlePresetCategoryChange"
          />
          <div v-if="activePresetGroup.items.length" class="flex flex-wrap gap-3">
            <DevicePresetCard
              v-for="preset in activePresetGroup.items"
              :key="preset.id"
              :preset="preset"
              @create="openCreate"
            />
          </div>
          <div v-else class="py-6 text-center a-color-text-tertiary text-sm">
            暂无 {{ activePresetGroup.label }} 预设
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend class="tracking-wide font-medium mb-2 op-50 uppercase text-xs">
          自定义设备
        </legend>
        <div class="mb-3 a-color-text-tertiary text-sm">
          内置预设用于快速建档，自定义设备可分配到具体账户。旧的面板运行时连接配置入口已移除，设备相关治理统一归到这里。
        </div>
        <div v-if="!customProfiles.length" class="py-6 text-center a-color-text-tertiary">
          暂无自定义设备配置
        </div>
        <div v-else class="flex flex-wrap gap-3">
          <DeviceProfileCard
            v-for="profile in customProfiles"
            :key="profile.id"
            :profile="profile"
            @edit="openEdit"
            @delete="handleDelete"
          />
        </div>
      </fieldset>
    </div>

    <DeviceEditModal
      v-model:open="showModal"
      :preset="activePreset"
      :profile="editingProfile"
      :submitting="submitting"
      @submit="handleSave"
    />
  </a-card>
</template>
