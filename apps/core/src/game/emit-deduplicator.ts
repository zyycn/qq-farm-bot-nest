/**
 * 统一 WS 推送去重：比对本次 payload 与上次 hash，一致则不推送。
 * 所有需要去重的 emit 都通过 hasChanged(key, data) 判断是否变更。
 */
export class EmitDeduplicator {
  private hashes = new Map<string, string>()

  /**
   * 若 data 与上次该 key 的 hash 一致则返回 false，否则更新 hash 并返回 true。
   */
  hasChanged(key: string, data: unknown): boolean {
    const hash = JSON.stringify(data)
    if (this.hashes.get(key) === hash)
      return false
    this.hashes.set(key, hash)
    return true
  }

  reset(key?: string): void {
    if (key)
      this.hashes.delete(key)
    else
      this.hashes.clear()
  }
}
