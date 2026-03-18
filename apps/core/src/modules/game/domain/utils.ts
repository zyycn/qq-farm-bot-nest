import { getServerTimeSec, toNum } from '@qq-farm/shared'

export { getServerTimeSec, sleep, toNum } from '@qq-farm/shared'

export const RE_TIME_HH_MM = /^(\d{1,2}):(\d{1,2})$/

export function toTimeSec(val: unknown): number {
  const n = toNum(val)
  if (n <= 0)
    return 0
  return n > 1e12 ? Math.floor(n / 1000) : n
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatLocalDateTime24(date = new Date()): string {
  const d = date instanceof Date ? date : new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

export function nowTimeStr(): string {
  const d = new Date()
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

export function getDateKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

export function getServerDateKey(): string {
  const nowSec = getServerTimeSec()
  const nowMs = nowSec > 0 ? nowSec * 1000 : Date.now()
  const bjOffset = 8 * 3600 * 1000
  const bjDate = new Date(nowMs + bjOffset)
  return `${bjDate.getUTCFullYear()}-${pad2(bjDate.getUTCMonth() + 1)}-${pad2(bjDate.getUTCDate())}`
}

/** 将奖励物品列表格式化为可读字符串，getItemName 由调用方提供（如 gameConfig.getItemName） */
export function getRewardSummary(items: any[], getItemName: (id: number) => string): string {
  return (items || []).filter(it => toNum(it?.count) > 0).map((it) => {
    const id = toNum(it.id)
    const count = toNum(it.count)
    if (id === 1 || id === 1001)
      return `金币${count}`
    if (id === 2 || id === 1101)
      return `经验${count}`
    if (id === 1002)
      return `点券${count}`
    return `${getItemName(id)}x${count}`
  }).join('/')
}

export function normalizeTimeString(v: string | undefined | null, fallback: string): string {
  const s = String(v || '').trim()
  const m = s.match(RE_TIME_HH_MM)
  if (!m)
    return fallback
  const hh = Math.max(0, Math.min(23, Number.parseInt(m[1], 10)))
  const mm = Math.max(0, Math.min(59, Number.parseInt(m[2], 10)))
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

const SENSITIVE_KEY_RE = /code|token|password|passwd|auth|ticket|cookie|session/i
const RE_QUERY_SENSITIVE = /([?&](?:code|token|ticket|password)=)[^&\s]+/gi
const RE_BEARER_TOKEN = /(Bearer\s+)[\w.-]+/gi

export function redactString(input: string): string {
  let text = String(input || '')
  text = text.replace(RE_QUERY_SENSITIVE, '$1[REDACTED]')
  text = text.replace(RE_BEARER_TOKEN, '$1[REDACTED]')
  return text
}

export function sanitizeMeta(value: any, depth = 0): any {
  if (depth > 4)
    return '[Truncated]'
  if (value === null || value === undefined)
    return value
  if (typeof value === 'string')
    return redactString(value)
  if (typeof value !== 'object')
    return value
  if (Array.isArray(value))
    return value.map(v => sanitizeMeta(v, depth + 1))

  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEY_RE.test(String(k)) ? '[REDACTED]' : sanitizeMeta(v, depth + 1)
  }
  return out
}

const MODULE_TAG_MAP: Record<string, string> = {
  farm: '农场',
  friend: '好友',
  warehouse: '仓库',
  task: '任务',
  system: '系统'
}

const TAG_MODULE_MAP: Record<string, string> = {
  农场: 'farm',
  商店: 'warehouse',
  购买: 'warehouse',
  仓库: 'warehouse',
  好友: 'friend',
  任务: 'task',
  活跃: 'task',
  系统: 'system',
  错误: 'system',
  WS: 'system',
  心跳: 'system',
  推送: 'system'
}

export function resolveModuleTag(moduleName: string): string {
  return MODULE_TAG_MAP[String(moduleName || '').trim()] || '系统'
}

export function inferModuleFromTag(tag: string): string {
  return TAG_MODULE_MAP[String(tag || '').trim()] || 'system'
}
