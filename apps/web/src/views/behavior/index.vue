<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useAccountRefresh } from '@/composables/useAccountRefresh'
import { useAccountStore, useBehaviorStore, useDeviceStore, useStrategyStore } from '@/stores'
import message from '@/utils/message'
import AccountInfoCard from './components/AccountInfoCard.vue'
import BehaviorConfigCard from './components/BehaviorConfigCard.vue'
import BehaviorInspectCard from './components/BehaviorInspectCard.vue'
import DeviceConfigCard from './components/DeviceConfigCard.vue'
import DeviceManagementCard from './components/DeviceManagementCard.vue'

const strategyStore = useStrategyStore()
const behaviorStore = useBehaviorStore()
const deviceStore = useDeviceStore()
const accountStore = useAccountStore()

const { currentAccount, currentAccountId } = storeToRefs(accountStore)
const saving = ref(false)

const currentAccountName = computed(() => {
  const account = currentAccount.value
  return account ? String(account.name || account.nick || account.uin || '') || null : null
})
const currentAccountUin = computed(() => currentAccount.value?.uin ?? undefined)
const currentAccountAvatar = computed(() => currentAccount.value?.avatar ?? undefined)

async function saveAccountSettings(): Promise<void> {
  if (!currentAccountId.value)
    return

  saving.value = true
  try {
    const [strategyRes, behaviorRes] = await Promise.all([
      strategyStore.saveSettings(currentAccountId.value),
      behaviorStore.saveConfig()
    ])

    if (strategyRes.ok && behaviorRes.ok) {
      message.success('账号行为设置已保存')
      return
    }

    const errors = [strategyRes.error, behaviorRes.error].filter(Boolean)
    message.error(`保存失败: ${errors.join(' / ')}`)
  } finally {
    saving.value = false
  }
}

async function initPageData(): Promise<void> {
  if (!currentAccountId.value) {
    behaviorStore.resetConfig()
    await deviceStore.loadAll()
    return
  }

  await Promise.allSettled([
    strategyStore.querySettings(),
    behaviorStore.queryConfig(),
    behaviorStore.queryInspect(),
    deviceStore.loadAll()
  ])
}

useAccountRefresh(initPageData)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap gap-2 items-center justify-between">
      <div class="font-bold flex gap-2 items-center a-color-text">
        <div class="i-streamline-emojis-man-farmer-1 text-lg" />
        <span class="text-lg">行为模拟</span>
      </div>
      <a-button
        v-if="currentAccountId"
        type="primary"
        size="small"
        :loading="saving"
        @click="saveAccountSettings"
      >
        保存账号行为设置
      </a-button>
    </div>

    <AccountInfoCard
      :account-id="currentAccountId"
      :account-name="currentAccountName"
      :account-uin="currentAccountUin"
      :account-avatar="currentAccountAvatar"
    />

    <template v-if="currentAccountId">
      <DeviceConfigCard />
      <BehaviorConfigCard />
      <BehaviorInspectCard />
    </template>

    <DeviceManagementCard />
  </div>
</template>
