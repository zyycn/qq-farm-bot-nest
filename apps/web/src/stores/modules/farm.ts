import type { FarmLand, FarmLandsResponse, FarmSummary, SeedOption, SingleLandOperationPayload } from '@/api/types'
import { defineStore } from 'pinia'
import { farmApi } from '@/api'

export type Land = FarmLand

export const useFarmStore = defineStore('farm', {
  state: () => ({
    lands: [] as FarmLand[],
    seeds: [] as SeedOption[],
    summary: {} as FarmSummary
  }),
  actions: {
    async operate(accountId: string, opType: string) {
      if (!accountId)
        return
      await farmApi.operate(opType)
    },
    async querySeeds(accountId: string): Promise<{ ok: boolean, error?: string }> {
      if (!accountId)
        return { ok: false, error: '未选择账号' }
      try {
        const list = await farmApi.querySeeds()
        this.setSeedsFromRealtime(Array.isArray(list) ? list : [])
        return { ok: true }
      } catch (e: unknown) {
        const error = e as { message?: string }
        return { ok: false, error: error?.message || '加载失败' }
      }
    },
    async fetchBagSeeds(accountId: string): Promise<void> {
      if (!accountId)
        return
      const list = await farmApi.queryBagSeeds()
      this.setSeedsFromRealtime(Array.isArray(list) ? list : [])
    },
    async operateSingleLand(
      accountId: string,
      payload: SingleLandOperationPayload
    ): Promise<unknown> {
      if (!accountId)
        return null
      return await farmApi.singleLandOperate(payload)
    },
    setLandsFromRealtime(res: FarmLandsResponse | null | undefined) {
      if (!res)
        return
      const nowSec = Math.floor(Date.now() / 1000)
      this.lands = (res.lands || []).map((l): FarmLand => ({
        ...l,
        matureAt: (l.matureInSec ?? 0) > 0 ? nowSec + l.matureInSec : 0
      }))
      this.summary = res.summary || {}
    },
    setSeedsFromRealtime(list: SeedOption[]) {
      this.seeds = Array.isArray(list) ? list : []
    }
  },
  persist: {
    storage: localStorage
  }
})
