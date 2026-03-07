import equal from '@blumintinc/fast-deep-equal'

/**
 * 统一 WS 推送去重：比对本次 payload 与上次 hash，一致则不推送。
 * 所有需要去重的 emit 都通过 hasChanged(key, data) 判断是否变更。
 */
export class EmitDeduplicator {
  private last = new Map<string, unknown>()

  hasChanged(key: string, data: any, ignore: string[] = []) {
    const clone = structuredClone(data)

    for (const k of ignore)
      delete clone[k]

    const prev = this.last.get(key)

    if (prev !== undefined && equal(prev, clone))
      return false

    this.last.set(key, clone)
    return true
  }
}
