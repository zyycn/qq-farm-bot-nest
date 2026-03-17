import { Buffer } from 'node:buffer'

// ==================== TCP 网络常量 ====================

export const TCP_PORT = 9800
export const TCP_HOST = '127.0.0.1'

// ==================== 运行时连接参数 ====================

/** 运行时连接参数（由 core 面板设置传入，可选） */
export interface ClientConfig {
  serverUrl?: string
  clientVersion?: string
  platform?: string
  os?: string
  userAgent?: string
  origin?: string
  deviceInfo?: {
    sysSoftware?: string
    sysHardware?: string
    telecomOper?: string
    network?: string
    screenWidth?: number
    screenHeight?: number
    density?: number
    cpu?: string
    memory?: string
    glRender?: string
    glVersion?: string
    deviceId?: string
    androidOaid?: string
    iosCaid?: string
  }
}

// ==================== Core → Link 请求 ====================

export interface ConnectRequest {
  type: 'connect'
  rid: string
  accountId: string
  code: string
  platform: string
  clientConfig?: ClientConfig
}

export interface RebindRequest {
  type: 'rebind'
  rid: string
  fromAccountId: string
  toAccountId: string
}

export interface DisconnectRequest {
  type: 'disconnect'
  rid: string
  accountId: string
}

export interface StatusRequest {
  type: 'status'
  rid: string
  accountId: string
}

export interface ListRequest {
  type: 'list'
  rid: string
}

/** 语义调用：core 传 service/method/params，link 负责编解码 */
export interface InvokeRequest {
  type: 'invoke'
  rid: string
  accountId: string
  service: string
  method: string
  /** 请求体（可序列化对象，link 侧用 proto 编码） */
  params: Record<string, unknown>
}

export type TcpRequest = ConnectRequest | RebindRequest | DisconnectRequest | StatusRequest | ListRequest | InvokeRequest

// ==================== Link → Core 响应 ====================

export interface TcpResponse {
  type: 'response'
  rid: string
  ok: boolean
  error?: string
  /** 语义调用解码后的结果（for type 'invoke'） */
  data?: unknown
  meta?: any
  userState?: any
}

/** Link → Core 推送事件 */
export interface TcpEvent {
  type: 'event'
  accountId: string
  event: string
  data: any
}

export type TcpOutbound = TcpResponse | TcpEvent

// ==================== Frame 编解码 ====================

/** 编码为 4 字节大端长度前缀 + JSON 的帧 */
export function encodeFrame(msg: TcpOutbound): Buffer {
  const json = JSON.stringify(msg)
  const payload = Buffer.from(json, 'utf-8')
  const frame = Buffer.alloc(4 + payload.length)
  frame.writeUInt32BE(payload.length, 0)
  payload.copy(frame, 4)
  return frame
}

/** 将 JSON 对象编码为带长度前缀的帧 */
export function encodeRequestFrame(msg: Record<string, unknown>): Buffer {
  const json = JSON.stringify(msg)
  const payload = Buffer.from(json, 'utf-8')
  const frame = Buffer.alloc(4 + payload.length)
  frame.writeUInt32BE(payload.length, 0)
  payload.copy(frame, 4)
  return frame
}

/** 流式帧解码器：处理 TCP 粘包/拆包 */
export class FrameDecoder<T = TcpRequest> {
  private buffer = Buffer.alloc(0)

  feed(chunk: Buffer): T[] {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const messages: T[] = []

    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32BE(0)
      if (this.buffer.length < 4 + len)
        break
      const payload = this.buffer.subarray(4, 4 + len)
      this.buffer = this.buffer.subarray(4 + len)
      try {
        messages.push(JSON.parse(payload.toString('utf-8')))
      }
      catch {}
    }

    return messages
  }

  reset() {
    this.buffer = Buffer.alloc(0)
  }
}
