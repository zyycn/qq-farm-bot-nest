import type { Scheduler } from '@qq-farm/shared'
import type WebSocket from 'ws'
import type { ProtoTypeRegistry } from '../proto/proto-runtime'
import type { MessageCallback } from './game-client-message'
import { Buffer } from 'node:buffer'
import { toLong } from '@qq-farm/shared'

interface GameClientTransportOptions {
  protoTypes: ProtoTypeRegistry
  scheduler: Scheduler
  pendingCallbacks: Map<number, MessageCallback>
  getSocket: () => WebSocket | null
  getClientSeq: () => number
  setClientSeq: (seq: number) => void
  getServerSeq: () => number
  onBusinessMessageSent: () => void
}

export class GameClientTransportController {
  constructor(private readonly options: GameClientTransportOptions) {}

  async sendMsg(
    serviceName: string,
    methodName: string,
    bodyBytes: Buffer,
    encodeBody: (body: Buffer) => Promise<Buffer>,
    callback?: MessageCallback
  ): Promise<boolean> {
    const socket = this.options.getSocket()
    if (!socket || socket.readyState !== socket.OPEN) {
      if (callback)
        callback(new Error('连接未打开'))
      return false
    }

    const seq = this.options.getClientSeq()
    let encoded: Buffer
    try {
      encoded = await this.encodeMsg(serviceName, methodName, bodyBytes, encodeBody)
    } catch (err) {
      if (callback)
        callback(err instanceof Error ? err : new Error(String(err)))
      return false
    }

    if (callback)
      this.options.pendingCallbacks.set(seq, callback)

    const currentSocket = this.options.getSocket()
    if (!currentSocket || currentSocket.readyState !== currentSocket.OPEN) {
      if (callback) {
        this.options.pendingCallbacks.delete(seq)
        callback(new Error('连接已在加密途中关闭'))
      }
      return false
    }

    currentSocket.send(encoded)

    if (methodName !== 'Heartbeat' && methodName !== 'BatchClientReportFlow' && methodName !== 'Login')
      this.options.onBusinessMessageSent()

    return true
  }

  sendMsgAsync(
    serviceName: string,
    methodName: string,
    bodyBytes: Buffer,
    timeout: number,
    sendMsg: (serviceName: string, methodName: string, bodyBytes: Buffer, callback?: MessageCallback) => Promise<boolean>
  ): Promise<{ body: Buffer, meta: unknown }> {
    return new Promise((resolve, reject) => {
      const socket = this.options.getSocket()
      if (!socket || socket.readyState !== socket.OPEN) {
        reject(new Error(`连接尚未打开: ${methodName}`))
        return
      }

      const seq = this.options.getClientSeq()
      const timeoutKey = `request_timeout_${seq}`
      this.options.scheduler.setTimeoutTask(timeoutKey, timeout, () => {
        this.options.pendingCallbacks.delete(seq)
        reject(new Error(`请求超时: ${methodName}（序号=${seq}）`))
      })

      sendMsg(serviceName, methodName, bodyBytes, (err, body, meta) => {
        this.options.scheduler.clear(timeoutKey)
        if (err)
          reject(err)
        else resolve({ body: body!, meta })
      }).then((sent) => {
        if (!sent) {
          this.options.scheduler.clear(timeoutKey)
          reject(new Error(`发送请求失败: ${methodName}`))
        }
      }).catch((err) => {
        this.options.scheduler.clear(timeoutKey)
        reject(err)
      })
    })
  }

  private async encodeMsg(
    serviceName: string,
    methodName: string,
    bodyBytes: Buffer,
    encodeBody: (body: Buffer) => Promise<Buffer>
  ): Promise<Buffer> {
    const finalBody = bodyBytes.length > 0 ? await encodeBody(bodyBytes) : Buffer.alloc(0)
    const clientSeq = this.options.getClientSeq()
    const serverSeq = this.options.getServerSeq()
    const gateMessage = this.options.protoTypes.GateMessage.create({
      meta: {
        service_name: serviceName,
        method_name: methodName,
        message_type: 1,
        client_seq: toLong(clientSeq),
        server_seq: toLong(serverSeq)
      },
      body: finalBody
    })

    const encoded = this.options.protoTypes.GateMessage.encode(gateMessage).finish()
    this.options.setClientSeq(clientSeq + 1)
    return Buffer.from(encoded)
  }
}
