import { defineStore } from 'pinia'
import { ref } from 'vue'
import { farmApi } from '@/api'

export interface Land {
  id: number
  plantName?: string
  phaseName?: string
  seedImage?: string
  status: string
  matureInSec: number
  needWater?: boolean
  needWeed?: boolean
  needBug?: boolean
  [key: string]: any
}

export const useFarmStore = defineStore('farm', () => {
  const lands = ref<Land[]>([])
  const seeds = ref<any[]>([])
  const summary = ref<any>({})

  async function operate(accountId: string, opType: string): Promise<void> {
    if (!accountId)
      return
    await farmApi.operate(opType)
  }

  function resetState(): void {
    lands.value = []
    summary.value = {}
    seeds.value = []
  }

  function setLandsFromRealtime(res: any): void {
    if (!res)
      return
    const nowSec = Math.floor(Date.now() / 1000)
    lands.value = (res.lands || []).map((l: any) => ({
      ...l,
      matureAt: (l.matureInSec ?? 0) > 0 ? nowSec + l.matureInSec : 0
    }))
    summary.value = res.summary || {}
  }

  function setSeedsFromRealtime(list: any[]): void {
    seeds.value = Array.isArray(list) ? list : []
  }

  farmApi.onLandsUpdate((data: any) => {
    if (data != null)
      setLandsFromRealtime(data)
  })

  farmApi.onSeedsUpdate((data: any) => {
    if (data != null)
      setSeedsFromRealtime(Array.isArray(data) ? data : [])
  })

  return { lands, summary, seeds, operate, resetState, setLandsFromRealtime, setSeedsFromRealtime }
}, {
  persist: {
    storage: sessionStorage
  }
})
