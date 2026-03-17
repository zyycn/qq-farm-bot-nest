<script setup lang="ts">
import type { InteractFilterKey } from './constants'
import type { FriendPlantSummary } from '@/api/types'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useAccountRefresh } from '@/composables/useAccountRefresh'
import { useFriendLandsWithCountdown } from '@/composables/useFriendLandsWithCountdown'
import { useWs } from '@/composables/useWs'
import { useAccountStore, useFriendStore, useStatusStore, useStrategyStore } from '@/stores'
import message from '@/utils/message'
import FriendRow from './components/FriendRow.vue'
import FriendToolbar from './components/FriendToolbar.vue'
import InteractPanel from './components/InteractPanel.vue'
import { OP_BUTTONS } from './constants'

const OP_TYPE_LABEL: Record<string, string> = Object.fromEntries(OP_BUTTONS.map(op => [op.type, op.label]))

interface FriendListItem {
  gid?: number | string
  uin?: number | string
  name?: string
  plant?: FriendPlantSummary
  [key: string]: unknown
}

interface InteractDisplayRecord {
  key: string
  serverTimeSec?: number
  serverTimeMs: number
  actionType: number
  actionLabel: string
  actionDetail?: string
  visitorGid: number
  nick: string
  avatarUrl: string
  level?: number
}

const accountStore = useAccountStore()
const friendStore = useFriendStore()
const statusStore = useStatusStore()
const strategyStore = useStrategyStore()
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const {
  friends,
  friendLands,
  friendLandsLoading,
  blacklist,
  interactRecords,
  interactLoading,
  interactError
} = storeToRefs(friendStore)
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

function getFriendId(friend: FriendListItem): string {
  return String(friend.gid ?? friend.uin ?? '').trim()
}

function getFriendName(friend: FriendListItem): string {
  return String(friend.name ?? '').trim()
}

function getFriendGid(friend: FriendListItem): number {
  return Number(friend.gid ?? 0)
}

const filteredFriends = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q)
    return friends.value
  return friends.value.filter(
    f => getFriendName(f).toLowerCase().includes(q) || String(f.uin ?? '').includes(q) || String(f.gid ?? '').includes(q)
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

const interactCollapsed = ref(true)
const interactFilter = ref<InteractFilterKey>('all')

const interactPanelRecords = computed<InteractDisplayRecord[]>(() => {
  return interactRecords.value.map((record) => {
    const serverTimeSec = Number(record.serverTimeSec ?? 0) || undefined
    const serverTimeMs = serverTimeSec ? serverTimeSec * 1000 : Date.now()
    const visitorGid = Number(record.visitorGid ?? 0)
    const nick = String(record.visitorName ?? record.targetName ?? (visitorGid > 0 ? `GID:${visitorGid}` : '访客'))
    const detailParts = [record.targetName, record.rewardText].filter(Boolean)
    return {
      key: `${visitorGid}-${record.actionType}-${serverTimeSec ?? serverTimeMs}`,
      serverTimeSec,
      serverTimeMs,
      actionType: Number(record.actionType ?? 0),
      actionLabel: String(record.actionName ?? '互动'),
      actionDetail: detailParts.length ? detailParts.join(' · ') : undefined,
      visitorGid,
      nick,
      avatarUrl: visitorGid > 0 ? `https://q1.qlogo.cn/g?b=qq&nk=${visitorGid}&s=100` : ''
    }
  })
})

async function refreshInteractRecords(): Promise<void> {
  if (!currentAccountId.value)
    return
  await friendStore.fetchInteractRecords(currentAccountId.value)
}

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
    } catch (e: unknown) {
      const error = e as { message?: string }
      message.error(error?.message || '操作失败')
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

async function handleToggleBlacklist(friend: FriendListItem, e: Event) {
  e.stopPropagation()
  if (!currentAccountId.value)
    return
  if (!currentAccount.value?.running)
    return
  try {
    const wasBlacklisted = blacklist.value.includes(Number(friend.gid))
    await friendStore.toggleBlacklist(currentAccountId.value, getFriendGid(friend))
    message.success(wasBlacklisted ? '已移出黑名单' : '已加入黑名单')
  } catch (err: unknown) {
    const error = err as { message?: string }
    message.error(error?.message || '操作失败')
  }
}

function handleAvatarError(key: string) {
  avatarErrorKeys.value.add(key)
}

async function syncBlacklistFromStrategy() {
  const ok = await strategyStore.querySettings()
  if (ok.ok) {
    const list = strategyStore.settings.friendBlacklist
    friendStore.setBlacklistFromRealtime(Array.isArray(list) ? list : [])
  }
}

async function initPageData(): Promise<void> {
  if (!currentAccountId.value)
    return
  await syncBlacklistFromStrategy()
}

useAccountRefresh(initPageData)

useWs()
  .sub('friends')
  .on('friends.update', friendStore.applyFriendsUpdate)
</script>

<template>
  <div class="flex flex-col gap-3 h-full overflow-hidden">
    <div class="font-bold flex shrink-0 gap-2 items-center a-color-text">
      <div class="i-streamline-emojis-man-and-woman-holding-hands-1 text-lg" />
      <span class="text-lg">好友农场</span>
    </div>

    <!-- 互动记录面板：最大高度50%，自适应内容高度 -->
    <a-card
      variant="borderless"
      class="flex shrink-0 flex-col max-h-[70%]"
      :classes="{ body: '!p-0 overflow-hidden flex flex-col' }"
    >
      <InteractPanel
        v-model:collapsed="interactCollapsed"
        v-model:filter="interactFilter"
        :records="interactPanelRecords"
        :loading="interactLoading"
        :error="interactError"
        class="flex flex-1 flex-col min-h-0"
        @refresh="refreshInteractRecords"
      />
    </a-card>

    <!-- 好友列表：填满剩余空间 -->
    <a-card
      variant="borderless"
      class="flex flex-1 flex-col min-h-0"
      :classes="{ body: '!p-0 !h-full !flex !flex-col' }"
    >
      <FriendToolbar
        v-model:search-query="searchQuery"
        :friend-count="friends.length"
        :blacklisted-count="blacklistedCount"
        class="shrink-0"
      />

      <div class="p-4 flex flex-1 flex-col min-h-0 overflow-y-auto space-y-3">
        <div v-if="!currentAccountId" class="flex flex-1 items-center justify-center">
          <EmptyState icon="i-streamline-emojis-man-and-woman-holding-hands-1 text-5xl" description="请先在侧边栏选择账号" />
        </div>

        <div v-else-if="!connected" class="flex flex-1 items-center justify-center">
          <EmptyState icon="i-streamline-emojis-electric-plug text-5xl" description="账号未连接，请先运行账号" />
        </div>

        <div v-else-if="friends.length === 0" class="flex flex-1 items-center justify-center">
          <EmptyState icon="i-streamline-emojis-man-shrugging-1 text-5xl" description="暂无好友数据" />
        </div>

        <!-- 好友列表 -->
        <div v-else class="a-border-border-sec border rounded-lg shadow-sm">
          <!-- 正常好友分区 -->
          <div
            class="a-bg-transparent px-4 py-2.5 border-b border-b-solid flex w-full cursor-pointer transition-colors items-center justify-between a-border-b-border-sec hover:a-bg-layout"
            @click="normalCollapsed = !normalCollapsed"
          >
            <div class="flex gap-2 items-center">
              <div class="i-streamline-emojis-thumbs-up-1 a-color-text-tertiary text-base" />
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
            />
          </div>

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
                :expanded="expandedFriends.has(getFriendId(friend))"
                :blacklisted="false"
                :lands="friendLandsWithCountdown[getFriendId(friend)] || []"
                :lands-loading="!!friendLandsLoading[getFriendId(friend)]"
                :avatar-error-keys="avatarErrorKeys"
                :disabled="!currentAccount?.running"
                @toggle="toggleFriend(getFriendId(friend))"
                @operate="(type, e) => handleOp(getFriendId(friend), type, e)"
                @toggle-blacklist="e => handleToggleBlacklist(friend, e)"
                @avatar-error="key => handleAvatarError(key)"
              />
            </div>
          </div>

          <!-- 黑名单分区 -->
          <div v-if="blacklistFriends.length > 0" class="border-t a-border-t-border-sec">
            <div
              class="a-bg-transparent px-4 py-2.5 border-b border-b-solid flex w-full cursor-pointer transition-colors items-center justify-between a-border-b-border-sec hover:a-bg-layout"
              @click="blacklistCollapsed = !blacklistCollapsed"
            >
              <div class="flex gap-2 items-center">
                <div class="i-streamline-emojis-cross-mark a-color-text-tertiary text-base" />
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
              />
            </div>

            <div v-show="!blacklistCollapsed">
              <div
                v-for="(friend, idx) in blacklistFriends"
                :key="friend.gid"
                :class="[idx > 0 ? 'border-t border-t-solid a-border-t-border-sec' : '']"
              >
                <FriendRow
                  :friend="friend"
                  :expanded="expandedFriends.has(getFriendId(friend))"
                  :blacklisted="true"
                  :lands="friendLandsWithCountdown[getFriendId(friend)] || []"
                  :lands-loading="!!friendLandsLoading[getFriendId(friend)]"
                  :avatar-error-keys="avatarErrorKeys"
                  :disabled="!currentAccount?.running"
                  @toggle="toggleFriend(getFriendId(friend))"
                  @operate="(type, e) => handleOp(getFriendId(friend), type, e)"
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
