<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useWsTopics } from '@/composables/useWsTopics'
import { useAccountStore, useFarmStore, useSettingStore } from '@/stores'
import message from '@/utils/message'
import AccountInfoCard from './components/AccountInfoCard.vue'
import OfflineReminderCard from './components/OfflineReminderCard.vue'
import PasswordCard from './components/PasswordCard.vue'
import StrategyAutomationCard from './components/StrategyAutomationCard.vue'

const settingStore = useSettingStore()
const accountStore = useAccountStore()
const farmStore = useFarmStore()

const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { seeds } = storeToRefs(farmStore)

const saving = ref(false)
const passwordSaving = ref(false)
const offlineSaving = ref(false)

const currentAccountName = computed(() => {
  const acc = currentAccount.value
  return acc ? String(acc.name || acc.nick || acc.uin || '') || null : null
})

const currentAccountUin = computed(() => {
  const uin = currentAccount.value?.uin
  return uin != null ? uin : undefined
})

const currentAccountAvatar = computed(() => currentAccount.value?.avatar ?? undefined)

const passwordForm = ref({
  old: '',
  new: '',
  confirm: ''
})

async function saveAccountSettings() {
  if (!currentAccountId.value)
    return
  saving.value = true
  try {
    const res = await settingStore.saveSettings(currentAccountId.value)
    if (res.ok) {
      message.success('账号设置已保存')
    } else {
      message.error(`保存失败: ${res.error}`)
    }
  } finally {
    saving.value = false
  }
}

async function handleChangePassword() {
  if (!passwordForm.value.old || !passwordForm.value.new) {
    message.error('请填写完整')
    return
  }
  if (passwordForm.value.new !== passwordForm.value.confirm) {
    message.error('两次密码输入不一致')
    return
  }
  if (passwordForm.value.new.length < 4) {
    message.error('密码长度至少4位')
    return
  }

  passwordSaving.value = true
  try {
    const res = await settingStore.changeAdminPassword(passwordForm.value.old, passwordForm.value.new)

    if (res.ok) {
      message.success('密码修改成功')
      passwordForm.value = { old: '', new: '', confirm: '' }
    } else {
      message.error(`修改失败: ${res.error || '未知错误'}`)
    }
  } finally {
    passwordSaving.value = false
  }
}

async function handleSaveOffline() {
  offlineSaving.value = true
  try {
    const res = await settingStore.saveOfflineConfig()

    if (res.ok) {
      message.success('下线提醒设置已保存')
    } else {
      message.error(`保存失败: ${res.error || '未知错误'}`)
    }
  } finally {
    offlineSaving.value = false
  }
}

useWsTopics(['settings', 'seeds'])
</script>

<template>
  <div class="h-full">
    <div class="flex flex-col gap-3 h-full">
      <AccountInfoCard
        :account-id="currentAccountId"
        :account-name="currentAccountName"
        :account-uin="currentAccountUin"
        :account-avatar="currentAccountAvatar"
      />

      <StrategyAutomationCard
        v-if="currentAccountId"
        :seeds="seeds"
        :current-account-id="currentAccountId"
        :saving="saving"
        @save="saveAccountSettings"
      />

      <div class="pb-3 shrink-0 gap-3 grid grid-cols-1 md:grid-cols-2">
        <PasswordCard
          v-model:password-form="passwordForm"
          :saving="passwordSaving"
          @submit="handleChangePassword"
        />
        <OfflineReminderCard
          :saving="offlineSaving"
          @save="handleSaveOffline"
        />
      </div>
    </div>
  </div>
</template>
