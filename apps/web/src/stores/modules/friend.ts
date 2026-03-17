import type { FarmLand, FriendInteractRecord, FriendLandDetailResponse, FriendLandSummary, FriendPlantSummary } from '@/api/types'
import { defineStore } from 'pinia'
import { friendApi } from '@/api'

type FriendListItem = Record<string, unknown> & {
  gid?: number | string
  plant?: FriendPlantSummary
}

function buildPlantSummaryFromDetail(lands: FarmLand[], summary: FriendLandSummary | null | undefined): FriendPlantSummary {
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
      if (land.occupiedByMaster)
        continue
      if (land.status === 'stealable')
        stealNum!++
      if (land.needWater)
        dryNum!++
      if (land.needWeed)
        weedNum!++
      if (land.needBug)
        insectNum!++
    }
  }

  return {
    stealNum: Number(stealNum) || 0,
    dryNum: Number(dryNum) || 0,
    weedNum: Number(weedNum) || 0,
    insectNum: Number(insectNum) || 0
  }
}

export const useFriendStore = defineStore('friend', {
  state: () => ({
    friends: [] as FriendListItem[],
    friendLands: {} as Record<string, FarmLand[]>,
    friendLandsLoading: {} as Record<string, boolean>,
    blacklist: [] as number[],
    interactRecords: [] as FriendInteractRecord[],
    interactLoading: false as boolean,
    interactError: '' as string
  }),
  actions: {
    syncFriendPlantSummary(friendId: string, lands: FarmLand[], summary: FriendLandSummary | null | undefined) {
      const key = String(friendId)
      const idx = this.friends.findIndex(f => String(f?.gid || '') === key)
      if (idx < 0)
        return
      const nextPlant = buildPlantSummaryFromDetail(lands, summary)
      this.friends[idx] = {
        ...this.friends[idx],
        plant: nextPlant
      }
    },
    async toggleBlacklist(accountId: string, gid: number) {
      if (!accountId || !gid)
        return
      const res = await friendApi.toggleBlacklist(gid)
      this.blacklist = res || []
    },
    async fetchFriendLands(accountId: string, friendId: string) {
      if (!accountId || !friendId)
        return
      this.friendLandsLoading = { ...this.friendLandsLoading, [friendId]: true }
      try {
        const res: FriendLandDetailResponse = await friendApi.getLands(Number(friendId))
        const rawLands = res?.lands || []
        const nowSec = Math.floor(Date.now() / 1000)
        const lands = rawLands.map((l): FarmLand => ({
          ...l,
          matureAt: nowSec + (l.matureInSec ?? 0)
        }))
        const summary = res?.summary ?? null
        this.friendLands = { ...this.friendLands, [friendId]: lands }
        this.syncFriendPlantSummary(friendId, lands, summary)
      } finally {
        this.friendLandsLoading = { ...this.friendLandsLoading, [friendId]: false }
      }
    },
    async operate(accountId: string, friendId: string, opType: string) {
      if (!accountId || !friendId)
        return
      await friendApi.operate(Number(friendId), opType)
    },
    async fetchInteractRecords(accountId: string) {
      if (!accountId)
        return
      this.interactLoading = true
      this.interactError = ''
      this.interactRecords = []
      try {
        const records = await friendApi.getInteractRecords()
        this.interactRecords = Array.isArray(records) ? records : []
      } catch (e: unknown) {
        const error = e as { message?: string }
        this.interactError = error?.message || '加载访客记录失败'
      } finally {
        this.interactLoading = false
      }
    },
    setFriendsFromRealtime(list: FriendListItem[]) {
      this.friends = Array.isArray(list) ? list : []
    },
    setBlacklistFromRealtime(list: Array<number | string>) {
      this.blacklist = Array.isArray(list) ? list.map(x => Number(x)).filter(n => !Number.isNaN(n)) : []
    },
    applyFriendsUpdate(data: FriendListItem[] | null | undefined) {
      this.setFriendsFromRealtime(Array.isArray(data) ? data : [])
    },
    applySettingsUpdateForBlacklist(data: { friendBlacklist?: Array<number | string>, stealCropBlacklist?: Array<number | string> } | null | undefined) {
      if (data != null) {
        if (Array.isArray(data.friendBlacklist))
          this.setBlacklistFromRealtime(data.friendBlacklist)
        else if (Array.isArray(data.stealCropBlacklist))
          this.setBlacklistFromRealtime(data.stealCropBlacklist)
      }
    }
  },
  persist: {
    storage: localStorage
  }
})
