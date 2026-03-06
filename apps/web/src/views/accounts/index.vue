<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AccountModal from '@/components/AccountModal.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import QqAvatar from '@/components/QqAvatar.vue'
import { useAccountStore } from '@/stores'

const router = useRouter()
const accountStore = useAccountStore()
const { accounts } = storeToRefs(accountStore)

const showModal = ref(false)
const showDeleteConfirm = ref(false)
const deleteLoading = ref(false)
const editingAccount = ref<any>(null)
const accountToDelete = ref<any>(null)

onMounted(() => accountStore.fetchAccounts())
useIntervalFn(() => accountStore.fetchAccounts(), 3000)

function openSettings(account: any) {
  accountStore.selectAccount(String(account.uin))
  router.push('/settings')
}

function openAddModal() {
  editingAccount.value = null
  showModal.value = true
}

function openEditModal(account: any) {
  editingAccount.value = { ...account }
  showModal.value = true
}

async function handleDelete(account: any) {
  accountToDelete.value = account
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (accountToDelete.value) {
    try {
      deleteLoading.value = true
      await accountStore.deleteAccount(String(accountToDelete.value.uin || accountToDelete.value.id))
      accountToDelete.value = null
      showDeleteConfirm.value = false
    } finally {
      deleteLoading.value = false
    }
  }
}

async function toggleAccount(account: any) {
  const ref = String(account.uin || account.id)
  if (account.running)
    await accountStore.stopAccount(ref)
  else await accountStore.startAccount(ref)
}

function handleSaved() {
  accountStore.fetchAccounts()
}
</script>

<template>
  <div class="flex flex-col gap-3 h-full">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="font-bold flex gap-2 items-center a-color-text">
        <div class="i-twemoji-bust-in-silhouette text-lg" />
        账号管理
        <span v-if="accounts.length" class="font-normal ml-1 a-color-text-tertiary text-sm">{{ accounts.length }} 个账号</span>
      </div>
      <a-button type="primary" @click="openAddModal">
        添加账号
      </a-button>
    </div>

    <div v-if="accounts.length === 0" class="flex flex-1 items-center justify-center">
      <EmptyState icon="i-twemoji-bust-in-silhouette text-5xl" description="暂无账号">
        <span class="a-color-text-tertiary text-sm">添加一个账号开始自动化管理农场</span>
      </EmptyState>
    </div>

    <!-- Account Cards -->
    <div v-else class="flex-1 overflow-y-auto">
      <div class="gap-3 grid grid-cols-1 lg:grid-cols-3 md:grid-cols-2 xl:grid-cols-4">
        <div
          v-for="acc in accounts"
          :key="acc.uin"
          class="group border-solid transition-all overflow-hidden a-bg-container a-border-border-sec border rounded-xl hover:shadow-md"
        >
          <!-- Status banner -->
          <div
            class="px-4 py-1.5 flex items-center justify-between text-sm"
            :class="acc.running ? 'a-bg-primary-bg a-color-primary' : 'a-bg-layout a-color-text-secondary'"
          >
            <div class="flex gap-1.5 items-center">
              <div
                class="rounded-full h-1.5 w-1.5"
                :class="acc.running ? 'a-bg-success animate-pulse' : 'a-bg-layout'"
              />
              {{ acc.running ? '运行中' : '已停止' }}
            </div>
            <span class="opacity-60 text-xs">UIN: {{ acc.uin }}</span>
          </div>

          <!-- Body -->
          <div class="px-4 py-3">
            <div class="flex gap-3 items-center">
              <QqAvatar :src="acc.avatar" :uin="acc.uin" :size="44" ring :platform="acc.platform" />
              <div class="flex flex-1 flex-col gap-1.5 min-w-0">
                <div class="font-bold truncate a-color-text">
                  {{ acc.nick }}
                </div>
                <div class="mt-0.5 a-color-text-tertiary text-sm">
                  备注: {{ acc.name || '-' }}
                </div>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="px-3 pb-3 gap-1.5 grid grid-cols-4 text-sm">
            <a-button color="primary" variant="filled" @click="toggleAccount(acc)">
              <div class="" :class="acc.running ? 'i-twemoji-stop-button' : 'i-twemoji-play-button'" />
            </a-button>
            <a-button color="primary" variant="filled" @click="openSettings(acc)">
              <div class="i-twemoji-gear" />
            </a-button>
            <a-button color="primary" variant="filled" @click="openEditModal(acc)">
              <div class="i-twemoji-memo" />
            </a-button>
            <a-button color="primary" variant="filled" @click="handleDelete(acc)">
              <div class="i-twemoji-wastebasket" />
            </a-button>
          </div>
        </div>
      </div>
    </div>

    <AccountModal :show="showModal" :edit-data="editingAccount" @close="showModal = false" @saved="handleSaved" />

    <ConfirmModal
      :show="showDeleteConfirm"
      :loading="deleteLoading"
      title="删除账号"
      :message="accountToDelete ? `确定要删除账号 ${accountToDelete.name || accountToDelete.uin} 吗?` : ''"
      confirm-text="删除"
      type="danger"
      @close="!deleteLoading && (showDeleteConfirm = false)"
      @cancel="!deleteLoading && (showDeleteConfirm = false)"
      @confirm="confirmDelete"
    />
  </div>
</template>
