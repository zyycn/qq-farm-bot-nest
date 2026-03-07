<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useFriendLandsWithCountdown } from '@/composables/useFriendLandsWithCountdown'
import { useWsTopics } from '@/composables/useWsTopics'
import { useAccountStore, useFriendStore, useStatusStore } from '@/stores'
import message from '@/utils/message'
import FriendRow from './components/FriendRow.vue'
import FriendToolbar from './components/FriendToolbar.vue'
import { OP_BUTTONS } from './constants'

const OP_TYPE_LABEL: Record<string, string> = Object.fromEntries(OP_BUTTONS.map(op => [op.type, op.label]))

const accountStore = useAccountStore()
const friendStore = useFriendStore()
const statusStore = useStatusStore()
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { friends, friendLands, friendLandsLoading, blacklist } = storeToRefs(friendStore)
const { status } = storeToRefs(statusStore)

const showConfirm = ref(false)
const confirmMessage = ref('')
const confirmLoading = ref(false)
const pendingAction = ref<(() => Promise<void>) | null>(null)
const pendingOpType = ref<string | null>(null)
const avatarErrorKeys = ref<Set<string>>(new Set())
const searchQuery = ref('')

const connected = computed(() => status.value?.connection?.connected)
const blacklistedCount = computed(() => friends.value.filter(f => blacklist.value.includes(Number(f.gid))).length)

const filteredFriends = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q)
    return friends.value
  return friends.value.filter(
    f => (f.name || '').toLowerCase().includes(q) || String(f.uin || '').includes(q) || String(f.gid || '').includes(q)
  )
})

const normalCollapsed = ref(false)
const blacklistCollapsed = ref(true)
const normalFriends = computed(() => {
  return filteredFriends.value.filter(f => !blacklist.value.includes(Number(f.gid)))
})
const blacklistFriends = computed(() => {
  return filteredFriends.value.filter(f => blacklist.value.includes(Number(f.gid)))
})

const expandedFriends = ref<Set<string>>(new Set())

function confirmAction(msg: string, action: () => Promise<void>, opType?: string) {
  confirmMessage.value = msg
  pendingAction.value = action
  pendingOpType.value = opType ?? null
  showConfirm.value = true
}

async function onConfirm() {
  if (pendingAction.value) {
    try {
      confirmLoading.value = true
      await pendingAction.value()
      const label = pendingOpType.value ? OP_TYPE_LABEL[pendingOpType.value] || '操作' : '操作'
      message.success(`${label}成功`)
    } catch (e: any) {
      message.error(e?.message || '操作失败')
    } finally {
      confirmLoading.value = false
      pendingAction.value = null
      pendingOpType.value = null
      showConfirm.value = false
    }
  } else {
    showConfirm.value = false
  }
}

const friendLandsWithCountdown = useFriendLandsWithCountdown(friendLands)

function toggleFriend(friendId: string) {
  if (expandedFriends.value.has(friendId)) {
    expandedFriends.value.delete(friendId)
  } else {
    expandedFriends.value.clear()
    expandedFriends.value.add(friendId)
    if (currentAccountId.value && currentAccount.value?.running && connected.value)
      friendStore.fetchFriendLands(currentAccountId.value, friendId)
  }
}

async function handleOp(friendId: string, type: string, e: Event) {
  e.stopPropagation()
  if (!currentAccountId.value)
    return
  if (!currentAccount.value?.running)
    return
  confirmAction('确定执行此操作吗?', async () => {
    await friendStore.operate(currentAccountId.value!, friendId, type)
  }, type)
}

async function handleToggleBlacklist(friend: any, e: Event) {
  e.stopPropagation()
  if (!currentAccountId.value)
    return
  if (!currentAccount.value?.running)
    return
  try {
    const wasBlacklisted = blacklist.value.includes(Number(friend.gid))
    await friendStore.toggleBlacklist(currentAccountId.value, Number(friend.gid))
    message.success(wasBlacklisted ? '已移出黑名单' : '已加入黑名单')
  } catch (err: any) {
    message.error(err?.message || '操作失败')
  }
}

function handleAvatarError(key: string) {
  avatarErrorKeys.value.add(key)
}

useWsTopics(['friends', 'settings'])
</script>

<template>
  <div class="flex flex-col gap-3 h-full">
    <div class="font-bold flex gap-2 items-center a-color-text">
      <div class="i-twemoji-people-hugging text-lg" />
      好友农场
    </div>

    <div v-if="!currentAccountId" class="flex flex-1 items-center justify-center">
      <EmptyState icon="i-twemoji-people-hugging text-5xl" description="请先在侧边栏选择账号" />
    </div>

    <div v-else-if="!connected" class="flex flex-1 items-center justify-center">
      <EmptyState icon="i-twemoji-electric-plug text-5xl" description="账号未连接，请先运行账号" />
    </div>

    <div v-else-if="friends.length === 0" class="flex flex-1 items-center justify-center">
      <EmptyState icon="i-twemoji-person-shrugging text-5xl" description="暂无好友数据" />
    </div>

    <a-card
      v-else
      variant="borderless"
      class="flex-1 overflow-hidden"
      :classes="{ body: '!p-0 !h-full !flex !flex-col' }"
    >
      <FriendToolbar
        v-model:search-query="searchQuery"
        :friend-count="friends.length"
        :blacklisted-count="blacklistedCount"
      />

      <div class="flex-1 min-h-0 overflow-y-auto">
        <div v-if="filteredFriends.length === 0" class="py-16 flex items-center justify-center">
          <EmptyState icon="i-twemoji-magnifying-glass-tilted-left text-4xl" description="未找到匹配的好友" />
        </div>

        <div v-else>
          <!-- 正常好友分区 -->
          <button
            type="button"
            class="a-bg-transparent hover:a-bg-fill-quaternary px-4 py-2.5 border-b border-b-solid flex w-full cursor-pointer transition-colors items-center justify-between a-border-b-border-sec"
            @click="normalCollapsed = !normalCollapsed"
          >
            <div class="flex gap-2 items-center">
              <div class="i-twemoji-thumbs-up a-color-text-tertiary text-base" />
              <div class="font-medium a-color-text-tertiary">
                正常好友
              </div>
              <a-tag size="small" color="blue">
                {{ normalFriends.length }}
              </a-tag>
            </div>
            <div
              class="i-carbon-chevron-right transition-transform duration-200 a-color-text-tertiary text-base"
              :class="[normalCollapsed ? '' : 'rotate-90']"
              aria-hidden="true"
            />
          </button>

          <div v-show="!normalCollapsed">
            <div v-if="normalFriends.length === 0" class="px-4 py-6 a-color-text-tertiary text-sm">
              暂无正常好友
            </div>
            <div
              v-for="(friend, idx) in normalFriends"
              v-else
              :key="friend.gid"
              :class="[idx > 0 ? 'border-t border-t-solid a-border-t-border-sec' : '']"
            >
              <FriendRow
                :friend="friend"
                :expanded="expandedFriends.has(friend.gid)"
                :blacklisted="false"
                :lands="friendLandsWithCountdown[friend.gid] || []"
                :lands-loading="!!friendLandsLoading[friend.gid]"
                :avatar-error-keys="avatarErrorKeys"
                :disabled="!currentAccount?.running"
                @toggle="toggleFriend(friend.gid)"
                @operate="(type, e) => handleOp(friend.gid, type, e)"
                @toggle-blacklist="e => handleToggleBlacklist(friend, e)"
                @avatar-error="key => handleAvatarError(key)"
              />
            </div>
          </div>

          <!-- 黑名单分区 -->
          <div v-if="blacklistFriends.length > 0" class="mt-2">
            <button
              type="button"
              class="a-bg-transparent hover:a-bg-fill-quaternary px-4 py-2.5 border-b border-b-solid flex w-full cursor-pointer transition-colors items-center justify-between a-border-b-border-sec"
              @click="blacklistCollapsed = !blacklistCollapsed"
            >
              <div class="flex gap-2 items-center">
                <div class="i-twemoji-prohibited a-color-text-tertiary text-base" />
                <div class="font-medium a-color-text-tertiary">
                  黑名单
                </div>
                <a-tag size="small" color="default">
                  {{ blacklistFriends.length }}
                </a-tag>
              </div>
              <div
                class="i-carbon-chevron-right transition-transform duration-200 a-color-text-tertiary text-base"
                :class="[blacklistCollapsed ? '' : 'rotate-90']"
                aria-hidden="true"
              />
            </button>

            <div v-show="!blacklistCollapsed">
              <div
                v-for="(friend, idx) in blacklistFriends"
                :key="friend.gid"
                :class="[idx > 0 ? 'border-t border-t-solid a-border-t-border-sec' : '']"
              >
                <FriendRow
                  :friend="friend"
                  :expanded="expandedFriends.has(friend.gid)"
                  :blacklisted="true"
                  :lands="friendLandsWithCountdown[friend.gid] || []"
                  :lands-loading="!!friendLandsLoading[friend.gid]"
                  :avatar-error-keys="avatarErrorKeys"
                  :disabled="!currentAccount?.running"
                  @toggle="toggleFriend(friend.gid)"
                  @operate="(type, e) => handleOp(friend.gid, type, e)"
                  @toggle-blacklist="e => handleToggleBlacklist(friend, e)"
                  @avatar-error="key => handleAvatarError(key)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </a-card>

    <ConfirmModal
      :show="showConfirm"
      :loading="confirmLoading"
      title="确认操作"
      :message="confirmMessage"
      @confirm="onConfirm"
      @cancel="!confirmLoading && (showConfirm = false)"
    />
  </div>
</template>
