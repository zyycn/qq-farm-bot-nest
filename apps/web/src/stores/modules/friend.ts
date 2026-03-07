import { defineStore } from 'pinia'
import { ref } from 'vue'
import { friendApi, settingsApi } from '@/api'

export const useFriendStore = defineStore('friend', () => {
  const friends = ref<any[]>([])
  const friendLands = ref<Record<string, any[]>>({})
  const friendLandsLoading = ref<Record<string, boolean>>({})
  const blacklist = ref<number[]>([])

  function buildPlantSummaryFromDetail(lands: any[], summary: any): Record<string, number> {
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

  function syncFriendPlantSummary(friendId: string, lands: any[], summary: any): void {
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

  async function toggleBlacklist(accountId: string, gid: number): Promise<void> {
    if (!accountId || !gid)
      return
    const res = await friendApi.toggleBlacklist(gid)
    blacklist.value = res || []
  }

  async function fetchFriendLands(accountId: string, friendId: string): Promise<void> {
    if (!accountId || !friendId)
      return
    friendLandsLoading.value[friendId] = true
    try {
      const res = await friendApi.getLands(Number(friendId))
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

  async function operateFriend(accountId: string, friendId: string, opType: string): Promise<void> {
    if (!accountId || !friendId)
      return
    await friendApi.operate(Number(friendId), opType)
  }

  function setFriendsFromRealtime(list: any[]): void {
    friends.value = Array.isArray(list) ? list : []
  }

  function setBlacklistFromRealtime(list: number[] | any[]): void {
    blacklist.value = Array.isArray(list) ? list.map((x: any) => Number(x)).filter(n => !Number.isNaN(n)) : []
  }

  friendApi.onFriendsUpdate((data: any) => {
    if (data != null)
      setFriendsFromRealtime(Array.isArray(data) ? data : [])
  })

  settingsApi.onSettingsUpdate((data: any) => {
    if (data != null) {
      if (Array.isArray(data.friendBlacklist))
        setBlacklistFromRealtime(data.friendBlacklist)
      else if (Array.isArray(data.stealCropBlacklist))
        setBlacklistFromRealtime(data.stealCropBlacklist)
    }
  })

  return {
    friends,
    friendLands,
    friendLandsLoading,
    blacklist,
    toggleBlacklist,
    fetchFriendLands,
    operate: operateFriend,
    setFriendsFromRealtime,
    setBlacklistFromRealtime
  }
}, {
  persist: {
    storage: sessionStorage
  }
})
