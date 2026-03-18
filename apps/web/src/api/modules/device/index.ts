import type * as Device from './types'
import { socket } from '../../services/socket'

export type * from './types'

export function getPresets(): Promise<Device.DevicePreset[]> {
  return socket.request('device.presets')
}

export function listDeviceProfiles(): Promise<Device.StoredDeviceProfile[]> {
  return socket.request('device.list')
}

export function createDeviceProfile(data: Device.CreateDeviceProfilePayload): Promise<Device.StoredDeviceProfile> {
  return socket.request('device.create', { ...data, id: `dev_${Date.now()}` })
}

export function updateDeviceProfile(id: string, data: Device.UpdateDeviceProfilePayload): Promise<Device.StoredDeviceProfile> {
  return socket.request('device.update', { id, ...data })
}

export function deleteDeviceProfile(id: string): Promise<{ ok: boolean }> {
  return socket.request('device.delete', { id })
}

export function getDefaultDeviceProfile(): Promise<Device.DefaultDeviceProfileResponse> {
  return socket.request('device.getDefault')
}

export function setDefaultDeviceProfile(deviceProfileId: string | null): Promise<Device.DefaultDeviceProfileResponse> {
  return socket.request('device.setDefault', { deviceProfileId })
}
