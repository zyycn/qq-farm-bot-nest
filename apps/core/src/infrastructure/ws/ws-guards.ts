import type { SocketWithMeta } from './ws-router.service'

export function requireAccountId(client: SocketWithMeta): string {
  const id = client.data.accountId ?? ''
  if (!id)
    throw new Error('未选择账号')
  return id
}

export function requireString(data: Record<string, unknown>, key: string, label?: string): string {
  const val = String(data?.[key] ?? '').trim()
  if (!val)
    throw new Error(label ?? `缺少 ${key}`)
  return val
}

export function requireNumber(data: Record<string, unknown>, key: string, label?: string): number {
  const val = Number(data?.[key])
  if (!val && val !== 0)
    throw new Error(label ?? `缺少 ${key}`)
  return val
}
