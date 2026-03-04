import { Buffer } from 'node:buffer'

/** Core -> Connector requests */
export interface ConnectRequest {
  type: 'connect'
  rid: string
  accountId: string
  code: string
  platform: string
}

export interface DisconnectRequest {
  type: 'disconnect'
  rid: string
  accountId: string
}

export interface SendRequest {
  type: 'send'
  rid: string
  accountId: string
  service: string
  method: string
  body: string // base64
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

export type Request = ConnectRequest | DisconnectRequest | SendRequest | StatusRequest | ListRequest

/** Connector -> Core responses */
export interface ResponseMessage {
  type: 'response'
  rid: string
  ok: boolean
  error?: string
  body?: string // base64
  meta?: any
  userState?: any
}

/** Connector -> Core push events */
export interface EventMessage {
  type: 'event'
  accountId: string
  event: string
  data: any
}

export type OutboundMessage = ResponseMessage | EventMessage

/** Frame encoding/decoding: 4-byte length prefix + JSON */
export function encodeFrame(msg: OutboundMessage): Buffer {
  const json = JSON.stringify(msg)
  const payload = Buffer.from(json, 'utf-8')
  const frame = Buffer.alloc(4 + payload.length)
  frame.writeUInt32BE(payload.length, 0)
  payload.copy(frame, 4)
  return frame
}

export class FrameDecoder {
  private buffer = Buffer.alloc(0)

  feed(chunk: Buffer): Request[] {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const messages: Request[] = []

    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32BE(0)
      if (this.buffer.length < 4 + len)
        break
      const payload = this.buffer.subarray(4, 4 + len)
      this.buffer = this.buffer.subarray(4 + len)
      try {
        messages.push(JSON.parse(payload.toString('utf-8')))
      } catch {}
    }

    return messages
  }

  reset() {
    this.buffer = Buffer.alloc(0)
  }
}
