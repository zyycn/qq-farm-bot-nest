import type { ProtoTypeRegistry } from '../proto/proto-runtime'
import type { GameClientConfig } from './game-client-config'
import { Buffer } from 'node:buffer'
import { toLong, toNum } from '@qq-farm/shared'

export interface ParsedLoginReply {
  gid: number
  name: string
  level: number
  gold: number
  exp: number
  avatarUrl: string
  openId: string
  serverTimeMs?: number
}

export function buildLoginRequestBody(protoTypes: ProtoTypeRegistry, config: GameClientConfig): Buffer {
  return Buffer.from(protoTypes.LoginRequest.encode(protoTypes.LoginRequest.create({
    sharer_id: toLong(0),
    sharer_open_id: '',
    device_info: {
      client_version: config.clientVersion,
      sys_software: config.deviceInfo.sysSoftware,
      sys_hardware: config.deviceInfo.sysHardware,
      telecom_oper: config.deviceInfo.telecomOper,
      network: config.deviceInfo.network,
      screen_width: toLong(config.deviceInfo.screenWidth || 0),
      screen_height: toLong(config.deviceInfo.screenHeight || 0),
      density: config.deviceInfo.density || 0,
      cpu: config.deviceInfo.cpu,
      memory: toLong(Number(config.deviceInfo.memory) || 0),
      gl_render: config.deviceInfo.glRender,
      gl_version: config.deviceInfo.glVersion,
      device_id: config.deviceInfo.deviceId,
      android_oaid: config.deviceInfo.androidOaid,
      ios_caid: config.deviceInfo.iosCaid
    },
    share_cfg_id: toLong(0),
    scene_id: '1256',
    report_data: {
      callback: '',
      cd_extend_info: '',
      click_id: '',
      clue_token: '',
      minigame_channel: 'other',
      minigame_platid: 2,
      req_id: '',
      trackid: ''
    }
  })).finish())
}

export function parseLoginReply(protoTypes: ProtoTypeRegistry, bodyBytes: Buffer): ParsedLoginReply {
  const reply = protoTypes.LoginReply!.decode(bodyBytes) as unknown as {
    basic?: {
      gid?: unknown
      name?: string
      level?: unknown
      gold?: unknown
      exp?: unknown
      avatar_url?: string
      open_id?: string
    }
    time_now_millis?: unknown
  }
  if (!reply.basic)
    throw new Error('登录响应缺少基础信息字段')

  return {
    gid: toNum(reply.basic.gid),
    name: reply.basic.name || '未知',
    level: toNum(reply.basic.level),
    gold: toNum(reply.basic.gold),
    exp: toNum(reply.basic.exp),
    avatarUrl: reply.basic.avatar_url || '',
    openId: reply.basic.open_id || '',
    serverTimeMs: reply.time_now_millis ? toNum(reply.time_now_millis) : undefined
  }
}

export function buildHeartbeatRequestBody(protoTypes: ProtoTypeRegistry, gid: number, clientVersion: string): Buffer {
  return Buffer.from(protoTypes.HeartbeatRequest.encode(protoTypes.HeartbeatRequest.create({
    gid: toLong(gid),
    client_version: clientVersion
  })).finish())
}

export function parseHeartbeatServerTime(protoTypes: ProtoTypeRegistry, replyBody: Buffer): number | null {
  const reply = protoTypes.HeartbeatReply!.decode(replyBody) as unknown as { server_time?: unknown }
  if (!reply.server_time)
    return null
  return toNum(reply.server_time)
}
