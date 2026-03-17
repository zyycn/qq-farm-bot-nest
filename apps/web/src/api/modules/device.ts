import type {
  CreateDeviceProfilePayload,
  DefaultDeviceProfileResponse,
  DevicePreset,
  StoredDeviceProfile,
  UpdateDeviceProfilePayload
} from '../types'
import { socket } from '../services/socket'

export function getPresets(): Promise<DevicePreset[]> {
  return socket.request('device.presets')
}

export function listDeviceProfiles(): Promise<StoredDeviceProfile[]> {
  return socket.request('device.list')
}

export function createDeviceProfile(data: CreateDeviceProfilePayload): Promise<StoredDeviceProfile> {
  return socket.request('device.create', { ...data, id: `dev_${Date.now()}` })
}

export function updateDeviceProfile(id: string, data: UpdateDeviceProfilePayload): Promise<StoredDeviceProfile> {
  return socket.request('device.update', { id, ...data })
}

export function deleteDeviceProfile(id: string): Promise<{ ok: boolean }> {
  return socket.request('device.delete', { id })
}

export function getDefaultDeviceProfile(): Promise<DefaultDeviceProfileResponse> {
  return socket.request('device.getDefault')
}

export function setDefaultDeviceProfile(deviceProfileId: string | null): Promise<DefaultDeviceProfileResponse> {
  return socket.request('device.setDefault', { deviceProfileId })
}
