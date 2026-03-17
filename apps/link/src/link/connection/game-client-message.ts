import type { ProtoTypeRegistry } from '../proto/proto-runtime'
import { Buffer } from 'node:buffer'
import { toNum } from '@qq-farm/shared'

export type MessageCallback = (err: Error | null, body?: Buffer, meta?: unknown) => void

interface DecodedGateMeta {
  server_seq?: unknown
  message_type?: number
  error_code?: unknown
  client_seq?: unknown
  error_message?: string
  method_name?: string
}

interface DecodedGateMessage {
  meta?: DecodedGateMeta
  body: Uint8Array
}

interface IncomingMessageContext {
  accountId: string
  protoTypes: ProtoTypeRegistry
  pendingCallbacks: Map<number, MessageCallback>
  serverSeq: number
  onNotify: (msg: unknown) => void
}

export function handleIncomingGameMessage(data: Buffer, context: IncomingMessageContext): number {
  const t = context.protoTypes as unknown as {
    GateMessage: { decode: (data: Buffer) => DecodedGateMessage }
  }

  let msg: DecodedGateMessage
  try {
    msg = t.GateMessage.decode(data)
  } catch {
    return context.serverSeq
  }

  const meta = msg.meta
  if (!meta)
    return context.serverSeq

  let nextServerSeq = context.serverSeq
  if (meta.server_seq) {
    const seq = toNum(meta.server_seq)
    if (seq > nextServerSeq)
      nextServerSeq = seq
  }

  if (meta.message_type === 3) {
    context.onNotify(msg)
    return nextServerSeq
  }

  if (meta.message_type === 2) {
    const errorCode = toNum(meta.error_code)
    const clientSeqVal = toNum(meta.client_seq)
    const cb = context.pendingCallbacks.get(clientSeqVal)
    if (cb) {
      context.pendingCallbacks.delete(clientSeqVal)
      if (errorCode !== 0)
        cb(new Error(meta.error_message || `${meta.method_name} 执行错误(${errorCode})`))
      else
        cb(null, Buffer.from(msg.body), meta)
    }
  }

  return nextServerSeq
}
