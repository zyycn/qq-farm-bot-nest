import type { DevicePreset, DeviceProfile } from '@qq-farm/shared'

export type DeviceProfileInput = Omit<DeviceProfile, 'id' | 'name' | 'presetId'>

export interface StoredDeviceProfile {
  id: string
  name: string
  presetId: string | null
  profile: Partial<DeviceProfileInput>
  createdAt: number
  updatedAt: number
}

export interface CreateDeviceProfilePayload {
  name: string
  presetId?: string
  profile: DeviceProfileInput
}

export interface UpdateDeviceProfilePayload {
  name?: string
  profile?: DeviceProfileInput
}

export interface DeviceSelectionOption {
  label: string
  value: string
}

export interface DefaultDeviceProfileResponse {
  deviceProfileId: string | null
}

export interface ResolvedDeviceSelection {
  source: 'preset' | 'custom'
  id: string
  name: string
  profile: Partial<DeviceProfileInput>
}

export type { DevicePreset }
