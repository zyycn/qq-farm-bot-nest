import type { UserState } from '@qq-farm/shared'
import type { ProtoTypeRegistry } from '../proto/proto-runtime'
import type { KickoutInfo, LinkNotifyPayload } from './game-client-events'
import { Buffer } from 'node:buffer'
import { toNum } from '@qq-farm/shared'

interface EventEnvelope {
  message_type?: string
  body: Uint8Array
}

interface DecodeMethods {
  decode: (body: Uint8Array) => unknown
  toObject: (decoded: unknown, options: { longs: StringConstructor, enums: StringConstructor }) => Record<string, unknown>
}

interface KickoutNotifyRecord {
  reason_message?: string
}

interface ItemChangeRecord {
  item?: {
    id?: unknown
    count?: unknown
  }
  delta?: unknown
}

interface ItemNotifyRecord extends Record<string, unknown> {
  items?: ItemChangeRecord[]
}

interface BasicNotifyRecord extends Record<string, unknown> {
  basic?: {
    level?: unknown
    gold?: unknown
    exp?: unknown
  }
}

interface NotifyHandlerContext {
  protoTypes: ProtoTypeRegistry
  userState: UserState
  emit: (eventName: string, payload?: unknown) => void
}

export function handleGameClientNotify(msg: unknown, context: NotifyHandlerContext): void {
  const gateMessage = msg as { body?: Uint8Array }
  const t = context.protoTypes as unknown as {
    EventMessage: { decode: (body: Uint8Array) => EventEnvelope }
    KickoutNotify?: { decode: (body: Uint8Array) => KickoutNotifyRecord }
    ItemNotify?: DecodeMethods
    BasicNotify?: DecodeMethods
    LandsNotify?: DecodeMethods
    IllustratedRewardRedDotNotifyV2?: DecodeMethods
    IllustratedChangeNotifyV2?: DecodeMethods
    TaskInfoNotify?: DecodeMethods
  }
  if (!gateMessage.body || gateMessage.body.length === 0)
    return

  const { userState } = context
  const event = (t.EventMessage as { decode: (body: Uint8Array) => EventEnvelope }).decode(gateMessage.body)
  const type = event.message_type || ''
  const eventBody = event.body

  if (type.includes('Kickout')) {
    try {
      const notify = t.KickoutNotify?.decode(eventBody)
      const reason = notify.reason_message || '未知'
      const payload: KickoutInfo = { type, reason }
      context.emit('kickout', payload)
    } catch {
      const payload: KickoutInfo = { type, reason: '未知' }
      context.emit('kickout', payload)
    }
    return
  }

  let notifyKind = ''
  let decodedPayload: unknown = null

  if (type.includes('ItemNotify')) {
    try {
      const decoded = t.ItemNotify?.decode(eventBody)
      const notify = t.ItemNotify?.toObject(decoded, { longs: String, enums: String }) as ItemNotifyRecord | undefined
      if (!notify)
        throw new Error('道具通知消息不可用')
      notifyKind = 'item'
      decodedPayload = notify
      const items = notify.items || []
      for (const itemChg of items) {
        const item = itemChg.item
        if (!item)
          continue
        const id = toNum(item.id)
        const count = toNum(item.count)
        const delta = toNum(itemChg.delta)

        if (id === 1101) {
          if (count > 0)
            userState.exp = count
          else if (delta !== 0)
            userState.exp = Math.max(0, (userState.exp || 0) + delta)
        } else if (id === 1 || id === 1001) {
          if (count > 0)
            userState.gold = count
          else if (delta !== 0)
            userState.gold = Math.max(0, (userState.gold || 0) + delta)
        } else if (id === 1002) {
          if (count > 0)
            userState.coupon = count
          else if (delta !== 0)
            userState.coupon = Math.max(0, (userState.coupon || 0) + delta)
        }
      }
      context.emit('stateChanged', { ...userState })
    } catch {}
  }

  if (type.includes('BasicNotify')) {
    try {
      const decoded = t.BasicNotify?.decode(eventBody)
      const notify = t.BasicNotify?.toObject(decoded, { longs: String, enums: String }) as BasicNotifyRecord | undefined
      if (!notify)
        throw new Error('基础信息通知消息不可用')
      notifyKind = 'basic'
      decodedPayload = notify
      if (notify.basic) {
        if (Object.hasOwn(notify.basic, 'level')) {
          const next = toNum(notify.basic.level)
          if (Number.isFinite(next) && next > 0)
            userState.level = next
        }
        if (Object.hasOwn(notify.basic, 'gold')) {
          const next = toNum(notify.basic.gold)
          if (Number.isFinite(next) && next >= 0)
            userState.gold = next
        }
        if (Object.hasOwn(notify.basic, 'exp')) {
          const exp = toNum(notify.basic.exp)
          if (Number.isFinite(exp) && exp >= 0)
            userState.exp = exp
        }
        context.emit('stateChanged', { ...userState })
      }
    } catch {}
  }

  if (type.includes('LandsNotify') && t.LandsNotify) {
    try {
      const decoded = t.LandsNotify.decode(eventBody)
      const notify = t.LandsNotify.toObject(decoded, { longs: String, enums: String })
      notifyKind = 'lands'
      decodedPayload = notify
    } catch {}
  }

  if (type.includes('IllustratedRewardRedDotNotify') && t.IllustratedRewardRedDotNotifyV2) {
    try {
      const decoded = t.IllustratedRewardRedDotNotifyV2.decode(eventBody)
      const notify = t.IllustratedRewardRedDotNotifyV2.toObject(decoded, { longs: String, enums: String })
      notifyKind = 'illustrated_reward'
      decodedPayload = notify
    } catch {}
  }

  if (type.includes('IllustratedChangeNotify') && t.IllustratedChangeNotifyV2) {
    try {
      const decoded = t.IllustratedChangeNotifyV2.decode(eventBody)
      const notify = t.IllustratedChangeNotifyV2.toObject(decoded, { longs: String, enums: String })
      notifyKind = 'illustrated_change'
      decodedPayload = notify
    } catch {}
  }

  if (type.includes('TaskInfoNotify')) {
    try {
      const decoded = t.TaskInfoNotify?.decode(eventBody)
      const notify = t.TaskInfoNotify?.toObject(decoded, { longs: String, enums: String })
      if (!notify)
        throw new Error('任务信息通知消息不可用')
      context.emit('taskInfoNotify', notify?.task_info ?? notify)
    } catch {}
  }

  const payload: LinkNotifyPayload = {
    type,
    body: Buffer.from(eventBody).toString('base64'),
    kind: notifyKind || undefined,
    decoded: decodedPayload || undefined
  }
  context.emit('notify', payload)
}
