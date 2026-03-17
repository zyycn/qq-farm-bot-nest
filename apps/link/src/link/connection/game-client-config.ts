import type { ClientConfig } from '@qq-farm/shared/node'
import {
  CLIENT_VERSION,
  DEFAULT_DEVICE_CPU,
  DEFAULT_DEVICE_DENSITY,
  DEFAULT_DEVICE_GL_RENDER,
  DEFAULT_DEVICE_GL_VERSION,
  DEFAULT_DEVICE_ID,
  DEFAULT_DEVICE_MEMORY,
  DEFAULT_DEVICE_NETWORK,
  DEFAULT_DEVICE_SCREEN_HEIGHT,
  DEFAULT_DEVICE_SCREEN_WIDTH,
  DEFAULT_DEVICE_SYS_HARDWARE,
  DEFAULT_DEVICE_SYS_SOFTWARE,
  DEFAULT_DEVICE_USER_AGENT,
  DEFAULT_OS,
  DEFAULT_PLATFORM,
  DEFAULT_REQUEST_ORIGIN,
  GAME_SERVER_URL
} from '@qq-farm/shared'

export interface GameClientDeviceInfo {
  sysSoftware: string
  sysHardware: string
  telecomOper: string
  network: string
  screenWidth: number
  screenHeight: number
  density: number
  cpu: string
  memory: string
  glRender: string
  glVersion: string
  deviceId: string
  androidOaid: string
  iosCaid: string
}

export interface GameClientConfig {
  serverUrl: string
  clientVersion: string
  os: string
  platform?: string
  userAgent: string
  origin: string
  deviceInfo: GameClientDeviceInfo
}

export function createGameClientConfig(clientConfig?: ClientConfig): GameClientConfig {
  const config = clientConfig || {}
  const device = config.deviceInfo || {}

  return {
    serverUrl: config.serverUrl || GAME_SERVER_URL,
    clientVersion: config.clientVersion || CLIENT_VERSION,
    platform: config.platform || DEFAULT_PLATFORM,
    os: config.os || DEFAULT_OS,
    userAgent: config.userAgent || DEFAULT_DEVICE_USER_AGENT,
    origin: config.origin || DEFAULT_REQUEST_ORIGIN,
    deviceInfo: {
      sysSoftware: device.sysSoftware || DEFAULT_DEVICE_SYS_SOFTWARE,
      sysHardware: device.sysHardware || DEFAULT_DEVICE_SYS_HARDWARE,
      telecomOper: device.telecomOper || '',
      network: device.network || DEFAULT_DEVICE_NETWORK,
      screenWidth: device.screenWidth || DEFAULT_DEVICE_SCREEN_WIDTH,
      screenHeight: device.screenHeight || DEFAULT_DEVICE_SCREEN_HEIGHT,
      density: device.density || DEFAULT_DEVICE_DENSITY,
      cpu: device.cpu || DEFAULT_DEVICE_CPU,
      memory: device.memory || DEFAULT_DEVICE_MEMORY,
      glRender: device.glRender || DEFAULT_DEVICE_GL_RENDER,
      glVersion: device.glVersion || DEFAULT_DEVICE_GL_VERSION,
      deviceId: device.deviceId || DEFAULT_DEVICE_ID,
      androidOaid: device.androidOaid || '',
      iosCaid: device.iosCaid || ''
    }
  }
}
