import equal from '@superblocksteam/fast-deep-equal'

/**
 * 统一 WS 推送去重：比对本次 payload 与上次 hash，一致则不推送。
 * 所有需要去重的 emit 都通过 hasChanged(key, data) 判断是否变更。
 */
export class EmitDeduplicator {
  private last = new Map<string, unknown>()

  hasChanged(key: string, data: unknown, ignore: string[] = []) {
    const clone = structuredClone(data)

    if (clone && typeof clone === 'object') {
      const record = clone as Record<string, unknown>
      for (const k of ignore)
        delete record[k]
    }

    const prev = this.last.get(key)

    if (prev !== undefined && equal(prev, clone))
      return false

    this.last.set(key, clone)
    return true
  }
}
