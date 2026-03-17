<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useAccountRefresh } from '@/composables/useAccountRefresh'
import { useAccountStore, useFarmStore, useStrategyStore } from '@/stores'
import message from '@/utils/message'
import AccountInfoCard from './components/AccountInfoCard.vue'
import StrategyAutomationCard from './components/StrategyAutomationCard.vue'
import StrategyIntervalsCard from './components/StrategyIntervalsCard.vue'
import StrategyPlantingCard from './components/StrategyPlantingCard.vue'

const strategyStore = useStrategyStore()
const accountStore = useAccountStore()
const farmStore = useFarmStore()

const { currentAccountId, currentAccount } = storeToRefs(accountStore)
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
    const result = await strategyStore.saveSettings(currentAccountId.value)
    if (result.ok) {
      message.success('策略设置已保存')
      return
    }

    message.error(result.error || '保存失败')
  } finally {
    saving.value = false
  }
}

async function initPageData(): Promise<void> {
  if (!currentAccountId.value)
    return

  await Promise.allSettled([
    strategyStore.querySettings(),
    farmStore.querySeeds(currentAccountId.value)
  ])
}

useAccountRefresh(initPageData)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap gap-2 items-center justify-between">
      <div class="font-bold flex gap-2 items-center a-color-text">
        <div class="i-streamline-emojis-clipboard text-lg" />
        <span class="text-lg">策略设置</span>
      </div>
      <a-button
        v-if="currentAccountId"
        type="primary"
        size="small"
        :loading="saving"
        @click="saveAccountSettings"
      >
        保存策略设置
      </a-button>
    </div>

    <AccountInfoCard
      :account-id="currentAccountId"
      :account-name="currentAccountName"
      :account-uin="currentAccountUin"
      :account-avatar="currentAccountAvatar"
    />

    <template v-if="currentAccountId">
      <StrategyPlantingCard />
      <StrategyIntervalsCard />
      <StrategyAutomationCard />
    </template>
  </div>
</template>
