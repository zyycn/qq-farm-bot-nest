import Long from 'long'

export function toLong(val: number): Long {
  return Long.fromNumber(val)
}

export function toNum(val: any): number {
  if (Long.isLong(val))
    return val.toNumber()
  return Number(val) || 0
}

let serverTimeMs = 0
let localTimeAtSync = 0

export function getServerTimeSec(): number {
  if (!serverTimeMs)
    return Math.floor(Date.now() / 1000)
  const elapsed = Date.now() - localTimeAtSync
  return Math.floor((serverTimeMs + elapsed) / 1000)
}

export function syncServerTime(ms: number): void {
  serverTimeMs = ms
  localTimeAtSync = Date.now()
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
