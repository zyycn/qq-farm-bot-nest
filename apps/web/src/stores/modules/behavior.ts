import type { BehaviorConfig } from '@qq-farm/shared'
import type { BehaviorInspectResponse } from '@/api/types'
import { createDefaultBehaviorConfig, mergeBehaviorConfig, normalizeBehaviorConfig } from '@qq-farm/shared'
import { defineStore } from 'pinia'
import { behaviorApi } from '@/api'

function initialBehaviorConfig(): BehaviorConfig {
  return createDefaultBehaviorConfig()
}

export const useBehaviorStore = defineStore('behavior', {
  state: () => ({
    config: initialBehaviorConfig(),
    inspect: null as BehaviorInspectResponse | null,
    loaded: false
  }),
  actions: {
    resetConfig(): void {
      this.config = initialBehaviorConfig()
      this.inspect = null
      this.loaded = false
    },
    applyConfigUpdate(data: unknown): void {
      if (!data || typeof data !== 'object')
        return
      this.config = mergeBehaviorConfig(this.config, data as Partial<BehaviorConfig>)
    },
    async queryConfig(): Promise<{ ok: boolean, error?: string }> {
      try {
        const data = await behaviorApi.query()
        this.config = normalizeBehaviorConfig(data)
        this.loaded = true
        return { ok: true }
      } catch (error: unknown) {
        const err = error as { message?: string }
        this.config = initialBehaviorConfig()
        this.loaded = false
        return { ok: false, error: err?.message || '加载失败' }
      }
    },
    async queryInspect(): Promise<{ ok: boolean, error?: string }> {
      try {
        this.inspect = await behaviorApi.inspect()
        return { ok: true }
      } catch (error: unknown) {
        const err = error as { message?: string }
        this.inspect = null
        return { ok: false, error: err?.message || '检查摘要加载失败' }
      }
    },
    async saveConfig(): Promise<{ ok: boolean, error?: string }> {
      if (!this.loaded)
        return { ok: false, error: '行为配置尚未加载完成' }
      try {
        const data = await behaviorApi.update(this.config)
        this.config = normalizeBehaviorConfig(data)
        await this.queryInspect()
        this.loaded = true
        return { ok: true }
      } catch (error: unknown) {
        const err = error as { message?: string }
        return { ok: false, error: err?.message || '保存失败' }
      }
    }
  }
})
