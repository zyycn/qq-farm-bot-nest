/** 完整设备配置档 — 对齐 proto DeviceInfo 全部 15 字段 + 连接参数 */
export interface DeviceProfile {
  id: string
  name: string
  presetId?: string

  // 连接参数
  serverUrl: string
  clientVersion: string
  platform: string
  os: string

  // Proto DeviceInfo (15 fields)
  sysSoftware: string
  sysHardware: string
  telecomOper: string
  network: string
  screenWidth: number
  screenHeight: number
  density: number
  cpu: string
  memory: number
  glRender: string
  glVersion: string
  deviceId: string
  androidOaid: string
  iosCaid: string

  // HTTP Headers
  userAgent: string
  origin: string
}

export interface DevicePreset {
  id: string
  name: string
  category: 'ios' | 'android' | 'windows'
  profile: Omit<DeviceProfile, 'id' | 'name' | 'presetId' | 'serverUrl'>
}
