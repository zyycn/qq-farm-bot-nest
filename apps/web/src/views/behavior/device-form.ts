import type {
  CreateDeviceProfilePayload,
  DevicePreset,
  DeviceProfileInput,
  StoredDeviceProfile,
  UpdateDeviceProfilePayload
} from '@/api/modules/device'

export interface DeviceFormState extends DeviceProfileInput {
  name: string
  presetId: string
}

export type DeviceEditSubmitPayload
  = | { type: 'create', data: CreateDeviceProfilePayload }
    | { type: 'update', id: string, data: UpdateDeviceProfilePayload }

const DEFAULT_DEVICE_FORM: DeviceFormState = {
  name: '',
  presetId: '',
  serverUrl: 'wss://gate-obt.nqf.qq.com/prod/ws',
  clientVersion: '1.7.0.6_20260313',
  platform: 'qq',
  os: 'iOS',
  sysSoftware: '',
  sysHardware: '',
  telecomOper: '',
  network: 'wifi',
  screenWidth: 0,
  screenHeight: 0,
  density: 0,
  cpu: '',
  memory: 0,
  glRender: '',
  glVersion: '',
  deviceId: '',
  androidOaid: '',
  iosCaid: '',
  userAgent: '',
  origin: 'https://gate-obt.nqf.qq.com'
}

function buildDeviceFormState(): DeviceFormState {
  return { ...DEFAULT_DEVICE_FORM }
}

export function createDeviceFormState(): DeviceFormState {
  return buildDeviceFormState()
}

export function resetDeviceForm(form: DeviceFormState): void {
  Object.assign(form, buildDeviceFormState())
}

export function applyPresetToDeviceForm(form: DeviceFormState, preset: DevicePreset): void {
  Object.assign(form, {
    ...buildDeviceFormState(),
    name: `${preset.name} (自定义)`,
    presetId: preset.id,
    ...preset.profile
  })
}

export function applyProfileToDeviceForm(form: DeviceFormState, profile: StoredDeviceProfile): void {
  Object.assign(form, {
    ...buildDeviceFormState(),
    name: profile.name,
    presetId: profile.presetId || '',
    ...profile.profile
  })
}

function toDeviceProfileInput(form: DeviceFormState): DeviceProfileInput {
  const { name: _name, presetId: _presetId, ...profile } = form
  return { ...profile }
}

export function toCreateDeviceProfilePayload(form: DeviceFormState): CreateDeviceProfilePayload {
  return {
    name: form.name.trim() || '未命名设备',
    presetId: form.presetId || undefined,
    profile: toDeviceProfileInput(form)
  }
}

export function toUpdateDeviceProfilePayload(form: DeviceFormState): UpdateDeviceProfilePayload {
  return {
    name: form.name.trim() || '未命名设备',
    profile: toDeviceProfileInput(form)
  }
}
