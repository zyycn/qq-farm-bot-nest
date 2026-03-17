import type {
  CreateDeviceProfilePayload,
  DefaultDeviceProfileResponse,
  DevicePreset,
  DeviceSelectionOption,
  ResolvedDeviceSelection,
  StoredDeviceProfile,
  UpdateDeviceProfilePayload
} from '@/api/types'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as deviceApi from '../../api/modules/device'

export const useDeviceStore = defineStore('device', () => {
  const presets = ref<DevicePreset[]>([])
  const customProfiles = ref<StoredDeviceProfile[]>([])
  const defaultDeviceProfileId = ref<string | null>(null)
  const loading = ref(false)

  const selectionOptions = computed<DeviceSelectionOption[]>(() => {
    const options: DeviceSelectionOption[] = []

    for (const preset of presets.value)
      options.push({ label: `[预设] ${preset.name}`, value: `preset:${preset.id}` })

    for (const profile of customProfiles.value)
      options.push({ label: `[自定义] ${profile.name}`, value: profile.id })

    return options
  })

  async function loadPresets(): Promise<void> {
    const res = await deviceApi.getPresets()
    presets.value = Array.isArray(res) ? res : []
  }

  async function loadCustomProfiles(): Promise<void> {
    const res = await deviceApi.listDeviceProfiles()
    customProfiles.value = Array.isArray(res) ? res : []
  }

  async function loadDefaultProfileId(): Promise<void> {
    const res: DefaultDeviceProfileResponse = await deviceApi.getDefaultDeviceProfile()
    defaultDeviceProfileId.value = res?.deviceProfileId ?? null
  }

  async function loadAll(): Promise<void> {
    loading.value = true
    try {
      await Promise.all([loadPresets(), loadCustomProfiles(), loadDefaultProfileId()])
    } finally {
      loading.value = false
    }
  }

  function findPresetById(id: string): DevicePreset | undefined {
    return presets.value.find(item => item.id === id)
  }

  function findCustomProfileById(id: string): StoredDeviceProfile | undefined {
    return customProfiles.value.find(item => item.id === id)
  }

  function resolveSelection(deviceProfileId: string | null | undefined): ResolvedDeviceSelection | null {
    const value = String(deviceProfileId || '')
    if (!value)
      return null

    if (value.startsWith('preset:')) {
      const preset = findPresetById(value.slice(7))
      return preset
        ? { source: 'preset', id: preset.id, name: preset.name, profile: preset.profile }
        : null
    }

    const profile = findCustomProfileById(value)
    return profile
      ? { source: 'custom', id: profile.id, name: profile.name, profile: profile.profile }
      : null
  }

  async function createProfile(data: CreateDeviceProfilePayload): Promise<StoredDeviceProfile> {
    const created = await deviceApi.createDeviceProfile(data)
    await loadCustomProfiles()
    return created
  }

  async function updateProfile(id: string, data: UpdateDeviceProfilePayload): Promise<StoredDeviceProfile> {
    const updated = await deviceApi.updateDeviceProfile(id, data)
    await loadCustomProfiles()
    return updated
  }

  async function deleteProfile(id: string): Promise<void> {
    await deviceApi.deleteDeviceProfile(id)
    await Promise.all([loadCustomProfiles(), loadDefaultProfileId()])
  }

  async function setDefaultProfileId(deviceProfileId: string | null): Promise<string | null> {
    const result = await deviceApi.setDefaultDeviceProfile(deviceProfileId)
    defaultDeviceProfileId.value = result?.deviceProfileId ?? null
    return defaultDeviceProfileId.value
  }

  return {
    presets,
    customProfiles,
    defaultDeviceProfileId,
    loading,
    selectionOptions,
    loadAll,
    loadPresets,
    loadCustomProfiles,
    loadDefaultProfileId,
    findPresetById,
    findCustomProfileById,
    resolveSelection,
    createProfile,
    updateProfile,
    deleteProfile,
    setDefaultProfileId
  }
})
