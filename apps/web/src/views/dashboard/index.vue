<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { logsApi } from '@/api'
import { useAccountRefresh } from '@/composables/useAccountRefresh'
import { useWsTopics } from '@/composables/useWsTopics'
import { useAccountStore, useBagStore, useStatusStore } from '@/stores'
import AccountExpCard from './components/AccountExpCard.vue'
import AssetsCard from './components/AssetsCard.vue'
import CheckCountdownCard from './components/CheckCountdownCard.vue'
import ItemsCard from './components/ItemsCard.vue'
import LogPanel from './components/LogPanel.vue'
import OperationsCard from './components/OperationsCard.vue'

const statusStore = useStatusStore()
const accountStore = useAccountStore()
const bagStore = useBagStore()
const { status, logs: statusLogs } = storeToRefs(statusStore)
const { dashboardItems } = storeToRefs(bagStore)

const filter = reactive({
  module: '',
  event: '',
  keyword: '',
  isWarn: ''
})

async function queryLogs() {
  const hasFilter = !!(filter.module || filter.event || filter.keyword.trim() || filter.isWarn)
  statusStore.setLogFilterActive(hasFilter)
  try {
    const data = await logsApi.query({
      module: filter.module || undefined,
      event: filter.event || undefined,
      keyword: filter.keyword.trim() || undefined,
      isWarn: filter.isWarn || undefined,
      limit: 50
    })
    statusStore.setLogs(Array.isArray(data) ? data : [])
  } catch {
    statusStore.setLogs([])
  }
}

function onFilterUpdate(payload: typeof filter) {
  Object.assign(filter, payload)
  queryLogs()
}

const displayName = computed(() => {
  const account = accountStore.currentAccount
  const gameName = status.value?.status?.name
  if (gameName) {
    if (account?.name)
      return `${gameName} (${account.name})`
    return gameName
  }
  if (!status.value?.connection?.connected) {
    if (account) {
      if (account.name && account.nick)
        return `${account.nick} (${account.name})`
      return account.name || account.nick || '未登录'
    }
    return '未登录'
  }
  if (account) {
    if (account.name && account.nick)
      return `${account.nick} (${account.name})`
    return account.name || account.nick || '未命名'
  }
  return '未命名'
})

const expRate = computed(() => {
  const gain = status.value?.sessionExpGained || 0
  const uptime = status.value?.uptime || 0
  if (!uptime)
    return '0/时'
  const hours = uptime / 3600
  const rate = hours > 0 ? gain / hours : 0
  return `${Math.floor(rate)}/时`
})

const timeToLevel = computed(() => {
  const gain = status.value?.sessionExpGained || 0
  const uptime = status.value?.uptime || 0
  const current = status.value?.levelProgress?.current || 0
  const needed = status.value?.levelProgress?.needed || 0
  if (!needed || !uptime || gain <= 0)
    return ''
  const hours = uptime / 3600
  const ratePerHour = hours > 0 ? gain / hours : 0
  if (ratePerHour <= 0)
    return ''
  const expNeeded = needed - current
  const minsToLevel = expNeeded / (ratePerHour / 60)
  if (minsToLevel < 60)
    return `约 ${Math.ceil(minsToLevel)} 分钟后升级`
  return `约 ${(minsToLevel / 60).toFixed(1)} 小时后升级`
})

const fertilizerNormal = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 1011))
const fertilizerOrganic = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 1012))
const collectionNormal = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 3001))
const collectionRare = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 3002))

const nextFarmCheck = ref('--')
const nextFriendCheck = ref('--')
const localUptime = ref(0)
let localNextFarmRemainSec = 0
let localNextFriendRemainSec = 0

function formatDuration(seconds: number): string {
  if (seconds <= 0)
    return '00:00:00'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (d > 0)
    return `${d}天 ${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function updateCountdowns() {
  if (status.value?.connection?.connected) {
    localUptime.value++
  }
  if (localNextFarmRemainSec > 0) {
    localNextFarmRemainSec--
    nextFarmCheck.value = formatDuration(localNextFarmRemainSec)
  } else {
    nextFarmCheck.value = '巡查中...'
  }
  if (localNextFriendRemainSec > 0) {
    localNextFriendRemainSec--
    nextFriendCheck.value = formatDuration(localNextFriendRemainSec)
  } else {
    nextFriendCheck.value = '巡查中...'
  }
}

watch(
  () => status.value?.nextChecks,
  (nextChecks) => {
    if (nextChecks) {
      localNextFarmRemainSec = nextChecks.farmRemainSec || 0
      localNextFriendRemainSec = nextChecks.friendRemainSec || 0
      updateCountdowns()
    }
  },
  { deep: true }
)
watch(
  () => status.value?.uptime,
  (uptime) => {
    if (uptime !== undefined)
      localUptime.value = uptime
  }
)

useWsTopics(['logs', 'bag', 'status'])

useAccountRefresh(queryLogs)

useIntervalFn(updateCountdowns, 1000)
</script>

<template>
  <div class="flex flex-col gap-3 md:h-full">
    <div class="gap-3 grid grid-cols-1 md:grid-cols-3">
      <AccountExpCard
        :display-name="displayName"
        :level="status?.status?.level || 0"
        :level-progress="status?.levelProgress"
        :exp-rate="expRate"
        :time-to-level="timeToLevel"
        :connected="!!status?.connection?.connected"
      />
      <AssetsCard
        :gold="status?.status?.gold || 0"
        :session-gold-gained="status?.sessionGoldGained || 0"
        :coupon="status?.status?.coupon || 0"
        :session-coupon-gained="status?.sessionCouponGained || 0"
        :uptime="localUptime"
      />
      <ItemsCard
        :fertilizer-normal="fertilizerNormal"
        :fertilizer-organic="fertilizerOrganic"
        :collection-normal="collectionNormal"
        :collection-rare="collectionRare"
      />
    </div>

    <div class="flex flex-1 flex-col gap-3 items-stretch md:flex-row md:overflow-hidden">
      <div class="flex flex-1 flex-col md:w-3/4 md:overflow-hidden">
        <LogPanel
          :logs="statusLogs"
          :filter="filter"
          @update:filter="onFilterUpdate"
        />
      </div>

      <div class="flex flex-col gap-3 md:w-1/4">
        <CheckCountdownCard
          :next-farm-check="nextFarmCheck"
          :next-friend-check="nextFriendCheck"
        />
        <OperationsCard :operations="status?.operations || {}" />
      </div>
    </div>
  </div>
</template>
