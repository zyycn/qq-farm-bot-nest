<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useAccountRefresh } from '@/composables/useAccountRefresh'
import { useAccountStore, useDeviceStore } from '@/stores'
import AccountInfoCard from './components/AccountInfoCard.vue'
import DeviceConfigCard from './components/DeviceConfigCard.vue'
import DeviceManagementCard from './components/DeviceManagementCard.vue'

const deviceStore = useDeviceStore()
const accountStore = useAccountStore()

const { currentAccount, currentAccountId } = storeToRefs(accountStore)

const currentAccountName = computed(() => {
  const account = currentAccount.value
  return account ? String(account.name || account.nick || account.uin || '') || null : null
})
const currentAccountUin = computed(() => currentAccount.value?.uin ?? undefined)
const currentAccountAvatar = computed(() => currentAccount.value?.avatar ?? undefined)

async function initPageData(): Promise<void> {
  await deviceStore.loadAll()
}

useAccountRefresh(initPageData)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="font-bold flex gap-2 items-center a-color-text">
      <div class="i-streamline-emojis-man-farmer-1 text-lg" />
      <span class="text-lg">设备模拟</span>
    </div>

    <AccountInfoCard
      :account-id="currentAccountId"
      :account-name="currentAccountName"
      :account-uin="currentAccountUin"
      :account-avatar="currentAccountAvatar"
    />

    <template v-if="currentAccountId">
      <DeviceConfigCard />
    </template>

    <DeviceManagementCard />
  </div>
</template>
