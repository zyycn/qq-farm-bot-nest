import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useStatusStore } from './status'

export const useFriendStore = defineStore('friend', () => {
  const friends = ref<any[]>([])
  const loading = ref(false)
  const friendLands = ref<Record<string, any[]>>({})
  const friendLandsLoading = ref<Record<string, boolean>>({})
  const blacklist = ref<number[]>([])

  function buildPlantSummaryFromDetail(lands: any[], summary: any) {
    const stealNumFromSummary = Array.isArray(summary?.stealable) ? summary.stealable.length : null
    const dryNumFromSummary = Array.isArray(summary?.needWater) ? summary.needWater.length : null
    const weedNumFromSummary = Array.isArray(summary?.needWeed) ? summary.needWeed.length : null
    const insectNumFromSummary = Array.isArray(summary?.needBug) ? summary.needBug.length : null

    let stealNum = stealNumFromSummary
    let dryNum = dryNumFromSummary
    let weedNum = weedNumFromSummary
    let insectNum = insectNumFromSummary

    if (stealNum === null || dryNum === null || weedNum === null || insectNum === null) {
      stealNum = 0
      dryNum = 0
      weedNum = 0
      insectNum = 0

      for (const land of (Array.isArray(lands) ? lands : [])) {
        if (!land || !land.unlocked)
          continue
        if (land.status === 'stealable')
          stealNum++
        if (land.needWater)
          dryNum++
        if (land.needWeed)
          weedNum++
        if (land.needBug)
          insectNum++
      }
    }

    return {
      stealNum: Number(stealNum) || 0,
      dryNum: Number(dryNum) || 0,
      weedNum: Number(weedNum) || 0,
      insectNum: Number(insectNum) || 0
    }
  }

  function syncFriendPlantSummary(friendId: string, lands: any[], summary: any) {
    const key = String(friendId)
    const idx = friends.value.findIndex(f => String(f?.gid || '') === key)
    if (idx < 0)
      return

    const nextPlant = buildPlantSummaryFromDetail(lands, summary)
    friends.value[idx] = {
      ...friends.value[idx],
      plant: nextPlant
    }
  }

  async function fetchFriends(_accountId: string) {
    // 好友列表仅通过 WebSocket friends:update 推送
  }

  async function fetchBlacklist(_accountId: string) {
    // 黑名单随 settings:update 推送
  }

  async function toggleBlacklist(accountId: string, gid: number) {
    if (!accountId || !gid)
      return
    const statusStore = useStatusStore()
    const res = await statusStore.wsRequest<number[]>('friend:toggle-blacklist', { gid })
    blacklist.value = res || []
  }

  async function fetchFriendLands(accountId: string, friendId: string) {
    if (!accountId || !friendId)
      return
    friendLandsLoading.value[friendId] = true
    try {
      const statusStore = useStatusStore()
      const res = await statusStore.wsRequest<{ lands?: any[], summary?: any }>('friend:lands', { gid: Number(friendId) })
      const rawLands = res?.lands || []
      const nowSec = Math.floor(Date.now() / 1000)
      const lands = rawLands.map((l: any) => ({
        ...l,
        matureAt: nowSec + (l.matureInSec ?? 0)
      }))
      const summary = res?.summary ?? null
      friendLands.value[friendId] = lands
      syncFriendPlantSummary(friendId, lands, summary)
    } finally {
      friendLandsLoading.value[friendId] = false
    }
  }

  async function operate(accountId: string, friendId: string, opType: string) {
    if (!accountId || !friendId)
      return
    const statusStore = useStatusStore()
    await statusStore.wsRequest('friend:operate', { gid: Number(friendId), opType })
  }

  function setFriendsFromRealtime(list: any[]) {
    friends.value = Array.isArray(list) ? list : []
  }

  function setBlacklistFromRealtime(list: number[] | any[]) {
    blacklist.value = Array.isArray(list) ? list.map((x: any) => Number(x)).filter(n => !Number.isNaN(n)) : []
  }

  return {
    friends,
    loading,
    friendLands,
    friendLandsLoading,
    blacklist,
    fetchFriends,
    fetchBlacklist,
    toggleBlacklist,
    fetchFriendLands,
    operate,
    setFriendsFromRealtime,
    setBlacklistFromRealtime
  }
})
