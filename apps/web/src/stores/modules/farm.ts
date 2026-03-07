import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useStatusStore } from './status'

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
  const loading = ref(false)

  async function fetchLands(_accountId: string) {
    // 土地数据仅通过 WebSocket lands:update 推送
  }

  async function fetchSeeds(_accountId: string) {
    // 种子数据在订阅时随 lands 等一并推送，暂无单独接口
  }

  async function operate(accountId: string, opType: string) {
    if (!accountId)
      return
    const statusStore = useStatusStore()
    await statusStore.wsRequest('farm:operate', { opType })
  }

  function resetState() {
    lands.value = []
    summary.value = {}
    seeds.value = []
  }

  function setLandsFromRealtime(res: any) {
    if (!res)
      return
    const nowSec = Math.floor(Date.now() / 1000)
    lands.value = (res.lands || []).map((l: any) => ({
      ...l,
      matureAt: (l.matureInSec ?? 0) > 0 ? nowSec + l.matureInSec : 0
    }))
    summary.value = res.summary || {}
  }

  function setSeedsFromRealtime(list: any[]) {
    seeds.value = Array.isArray(list) ? list : []
  }

  return { lands, summary, seeds, loading, fetchLands, fetchSeeds, operate, resetState, setLandsFromRealtime, setSeedsFromRealtime }
})
