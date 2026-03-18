<script setup lang="ts">
import type { FarmLand } from '@/api/modules/farm'
import { computed } from 'vue'
import QqAvatar from '@/components/QqAvatar.vue'
import { OP_BUTTONS } from '../constants'
import FriendLands from './FriendLands.vue'

interface FriendPlantStatus {
  stealNum?: number
  dryNum?: number
  weedNum?: number
  insectNum?: number
}

interface FriendListItem {
  gid?: number | string
  uin?: number | string
  name?: string
  level?: number
  avatarUrl?: string
  avatar_url?: string
  plant?: FriendPlantStatus
  [key: string]: unknown
}

const props = defineProps<{
  friend: FriendListItem
  expanded: boolean
  blacklisted: boolean
  lands: FarmLand[]
  landsLoading: boolean
  avatarErrorKeys: Set<string>
  disabled?: boolean
}>()

const emit = defineEmits<{
  toggle: []
  operate: [type: string, e: Event]
  toggleBlacklist: [e: Event]
  avatarError: [key: string]
}>()

function getFriendStatusTags(friend: FriendListItem) {
  const p = friend.plant || {}
  const tags: { label: string, icon: string, class: string }[] = []
  if (p.stealNum) {
    tags.push({
      label: `可偷 ${p.stealNum}`,
      icon: 'i-streamline-emojis-ok-hand-1',
      class: 'a-bg-layout a-color-text-secondary'
    })
  }
  if (p.dryNum) {
    tags.push({ label: `浇水 ${p.dryNum}`, icon: 'i-streamline-emojis-droplet', class: 'a-bg-layout a-color-info' })
  }
  if (p.weedNum) {
    tags.push({ label: `除草 ${p.weedNum}`, icon: 'i-streamline-emojis-herb', class: 'a-bg-layout a-color-success' })
  }
  if (p.insectNum) {
    tags.push({ label: `除虫 ${p.insectNum}`, icon: 'i-streamline-emojis-bug', class: 'a-bg-layout a-color-warning' })
  }
  return tags
}

function getFriendAvatar(friend: FriendListItem) {
  const direct = String(friend?.avatarUrl || friend?.avatar_url || '').trim()
  if (direct)
    return direct
  const uin = String(friend?.uin || '').trim()
  if (uin)
    return `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=100`
  return ''
}

function getFriendAvatarKey(friend: FriendListItem) {
  return String(friend?.gid || friend?.uin || '').trim() || String(friend?.name || '').trim()
}

const canShowAvatar = computed(() => {
  const key = getFriendAvatarKey(props.friend)
  if (!key)
    return false
  return !!getFriendAvatar(props.friend) && !props.avatarErrorKeys.has(key)
})

const avatarSrc = computed(() => (canShowAvatar.value ? getFriendAvatar(props.friend) : undefined))

function handleAvatarError() {
  emit('avatarError', getFriendAvatarKey(props.friend))
}

function handleToggle() {
  emit('toggle')
}

function handleOperate(type: string, e: Event) {
  emit('operate', type, e)
}

function handleToggleBlacklist(e: Event) {
  emit('toggleBlacklist', e)
}
</script>

<template>
  <div class="transition-colors" :class="blacklisted ? 'opacity-50' : ''">
    <!-- Friend Row -->
    <div
      class="px-4 py-3 flex gap-3 cursor-pointer transition-colors items-center"
      :class="expanded ? 'a-bg-primary-bg' : 'bg-transparent hover:a-bg-layout'"
      @click="handleToggle"
    >
      <div class="shadow-sm" :style="{ '--un-ring-color': 'var(--ant-color-bg-container)' }">
        <QqAvatar
          :src="avatarSrc"
          :size="38"
          ring
          @error="handleAvatarError"
        />
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex gap-2 items-center">
          <span class="font-semibold truncate a-color-text">{{ friend.name }}</span>
          <span
            v-if="friend.level"
            class="text-[10px] font-medium px-1 py-px inline-flex shrink-0 transition-colors duration-200 items-center a-color-primary a-bg-primary-bg rounded"
          >
            Lv.{{ friend.level }}
          </span>
          <a-tag v-if="blacklisted" size="small" color="default">
            屏蔽
          </a-tag>
        </div>
        <div class="mt-0.5 flex flex-wrap gap-1 items-center">
          <template v-if="getFriendStatusTags(friend).length">
            <div
              v-for="tag in getFriendStatusTags(friend)"
              :key="tag.label"
              class="text-[10px] px-1 py-px flex gap-0.5 items-center rounded"
              :class="tag.class"
            >
              <div class="text-xs" :class="tag.icon" />
              {{ tag.label }}
            </div>
          </template>
          <span v-else class="a-color-text-tertiary text-sm">无可操作</span>
        </div>
      </div>

      <!-- Operations (desktop) -->
      <div class="gap-1 hidden items-center sm:flex">
        <a-tooltip v-for="op in OP_BUTTONS" :key="op.type" :title="op.label" placement="top">
          <a-button
            class="p-1.5 flex transition-all items-center justify-center a-bg-container a-border-border border rounded-lg active:scale-95 hover:shadow-sm"
            :disabled="disabled"
            :class="disabled ? 'opacity-40 pointer-events-none' : ''"
            @click="handleOperate(op.type, $event)"
          >
            <div :class="op.icon" />
          </a-button>
        </a-tooltip>
        <a-tooltip :title="blacklisted ? '移出黑名单' : '加入黑名单'" placement="top">
          <a-button
            class="ml-1 p-1.5 flex transition-all items-center justify-center rounded-lg active:scale-95"
            :disabled="disabled"
            :class="
              (blacklisted
                ? 'border a-border-success a-bg-primary-bg'
                : 'border a-border-border a-bg-container')
                + (disabled ? ' opacity-40 pointer-events-none' : '')
            "
            @click="handleToggleBlacklist($event)"
          >
            <div :class="blacklisted ? 'i-streamline-emojis-ballot-box-with-check' : 'i-streamline-emojis-cross-mark'" />
          </a-button>
        </a-tooltip>
      </div>

      <div class="transition-transform a-color-text-tertiary" :class="expanded ? 'rotate-90' : ''">
        <div class="i-streamline-emojis-backhand-index-pointing-right-1" />
      </div>
    </div>

    <!-- Mobile operations -->
    <div
      v-if="expanded"
      class="px-4 py-2 border-t border-t-solid flex flex-wrap gap-1.5 a-border-t-border-sec sm:hidden"
    >
      <a-button
        v-for="op in OP_BUTTONS"
        :key="op.type"
        class="px-2 py-1 flex gap-1 transition-all items-center a-bg-container a-border-border border text-sm rounded-lg active:scale-95"
        :disabled="disabled"
        :class="disabled ? 'opacity-40 pointer-events-none' : ''"
        @click="handleOperate(op.type, $event)"
      >
        <div :class="op.icon" />
        {{ op.label }}
      </a-button>
      <a-button
        class="px-2 py-1 flex gap-1 transition-all items-center text-sm rounded-lg active:scale-95"
        :disabled="disabled"
        :class="
          (blacklisted
            ? 'border a-border-success a-bg-primary-bg'
            : 'border a-border-border a-bg-container')
            + (disabled ? ' opacity-40 pointer-events-none' : '')
        "
        @click="handleToggleBlacklist($event)"
      >
        <div :class="blacklisted ? 'i-streamline-emojis-ballot-box-with-check' : 'i-streamline-emojis-cross-mark'" />
        {{ blacklisted ? '取消屏蔽' : '屏蔽' }}
      </a-button>
    </div>

    <!-- Expanded Lands -->
    <FriendLands v-if="expanded" :lands="lands" :loading="landsLoading" />
  </div>
</template>
