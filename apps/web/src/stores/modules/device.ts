import type {
  CreateDeviceProfilePayload,
  DefaultDeviceProfileResponse,
  DevicePreset,
  DeviceSelectionOption,
  ResolvedDeviceSelection,
  StoredDeviceProfile,
  UpdateDeviceProfilePayload
} from '@/api/modules/device'
import { defineStore } from 'pinia'
import * as deviceApi from '../../api/modules/device'

const GLOBAL_DEVICE_VALUE = '__global_default_device__'

function normalizeDeviceProfileId(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim()
  return normalized && normalized !== GLOBAL_DEVICE_VALUE ? normalized : null
}

export interface DeviceState {
  presets: DevicePreset[]
  customProfiles: StoredDeviceProfile[]
  defaultDeviceProfileId: string | null
  loading: boolean
}

export const useDeviceStore = defineStore('device', {
  state: (): DeviceState => ({
    presets: [],
    customProfiles: [],
    defaultDeviceProfileId: null,
    loading: false
  }),
  getters: {
    selectionOptions(state): DeviceSelectionOption[] {
      const options: DeviceSelectionOption[] = []

      for (const preset of state.presets)
        options.push({ label: `[预设] ${preset.name}`, value: `preset:${preset.id}` })

      for (const profile of state.customProfiles)
        options.push({ label: `[自定义] ${profile.name}`, value: profile.id })

      return options
    }
  },
  actions: {
    async loadPresets(): Promise<void> {
      const res = await deviceApi.getPresets()
      this.presets = Array.isArray(res) ? res : []
    },

    async loadCustomProfiles(): Promise<void> {
      const res = await deviceApi.listDeviceProfiles()
      this.customProfiles = Array.isArray(res) ? res : []
    },

    async loadDefaultProfileId(): Promise<void> {
      const res: DefaultDeviceProfileResponse = await deviceApi.getDefaultDeviceProfile()
      this.defaultDeviceProfileId = normalizeDeviceProfileId(res?.deviceProfileId)
    },

    async loadAll(): Promise<void> {
      this.loading = true
      try {
        await Promise.all([this.loadPresets(), this.loadCustomProfiles(), this.loadDefaultProfileId()])
      } finally {
        this.loading = false
      }
    },

    findPresetById(id: string): DevicePreset | undefined {
      return this.presets.find(item => item.id === id)
    },

    findCustomProfileById(id: string): StoredDeviceProfile | undefined {
      return this.customProfiles.find(item => item.id === id)
    },

    resolveSelection(deviceProfileId: string | null | undefined): ResolvedDeviceSelection | null {
      const value = normalizeDeviceProfileId(deviceProfileId)
      if (!value)
        return null

      if (value.startsWith('preset:')) {
        const preset = this.findPresetById(value.slice(7))
        return preset
          ? { source: 'preset', id: preset.id, name: preset.name, profile: preset.profile }
          : null
      }

      const profile = this.findCustomProfileById(value)
      return profile
        ? { source: 'custom', id: profile.id, name: profile.name, profile: profile.profile }
        : null
    },

    async createProfile(data: CreateDeviceProfilePayload): Promise<StoredDeviceProfile> {
      const created = await deviceApi.createDeviceProfile(data)
      await this.loadCustomProfiles()
      return created
    },

    async updateProfile(id: string, data: UpdateDeviceProfilePayload): Promise<StoredDeviceProfile> {
      const updated = await deviceApi.updateDeviceProfile(id, data)
      await this.loadCustomProfiles()
      return updated
    },

    async deleteProfile(id: string): Promise<void> {
      await deviceApi.deleteDeviceProfile(id)
      await Promise.all([this.loadCustomProfiles(), this.loadDefaultProfileId()])
    },

    async setDefaultProfileId(deviceProfileId: string | null): Promise<string | null> {
      const result = await deviceApi.setDefaultDeviceProfile(normalizeDeviceProfileId(deviceProfileId))
      this.defaultDeviceProfileId = normalizeDeviceProfileId(result?.deviceProfileId)
      return this.defaultDeviceProfileId
    }
  }
})
