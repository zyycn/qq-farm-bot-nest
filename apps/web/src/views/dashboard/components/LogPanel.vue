<script setup lang="ts">
import type { LogEntry, LogQueryOptions } from '@/api/modules/logs'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import { EVENTS, LOG_LEVELS, MODULES } from '../constants'

const props = defineProps<{
  logs: LogEntry[]
  filter: LogQueryOptions
}>()

const emit = defineEmits<{
  'update:filter': [value: typeof props.filter]
}>()

const filterPopoverOpen = ref(false)

const draftFilter = ref<typeof props.filter>({
  module: '',
  event: '',
  keyword: '',
  isWarn: ''
})

watch(filterPopoverOpen, (open) => {
  if (open)
    draftFilter.value = { ...props.filter }
})

const hasActiveFilter = computed(() =>
  !!(props.filter.module || props.filter.event || props.filter.keyword?.trim() || props.filter.isWarn))

function setDraftField(key: keyof typeof props.filter, value: string) {
  draftFilter.value = { ...draftFilter.value, [key]: value }
}

function applyQuery() {
  emit('update:filter', { ...draftFilter.value })
  filterPopoverOpen.value = false
}

function resetFilter() {
  draftFilter.value = { module: '', event: '', keyword: '', isWarn: '' }
  emit('update:filter', { ...draftFilter.value })
  filterPopoverOpen.value = false
}

const logContainer = ref<HTMLElement | null>(null)
const autoScroll = ref(true)

const eventLabelMap: Record<string, string> = Object.fromEntries(
  EVENTS.filter(e => e.value).map(e => [e.value, e.label])
)

function getEventLabel(event: string): string {
  return eventLabelMap[event] || event
}

function formatLogTime(timeStr: string): string {
  if (!timeStr)
    return ''
  const parts = timeStr.split(' ')
  return (parts.length > 1 ? parts[1] : timeStr) ?? ''
}

function onLogScroll(e: Event) {
  const el = e.target as HTMLElement
  if (!el)
    return
  const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
  autoScroll.value = isNearBottom
}

function scrollLogsToBottom(force = false) {
  nextTick(() => {
    if (!logContainer.value)
      return
    if (!force && !autoScroll.value)
      return
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  })
}

watch(
  () => props.logs,
  () => scrollLogsToBottom(),
  { deep: true }
)

onMounted(() => {
  autoScroll.value = true
  scrollLogsToBottom(true)
})
</script>

<template>
  <a-card
    variant="borderless"
    class="flex flex-1 flex-col md:overflow-hidden"
    :classes="{ body: '!flex !flex-col !flex-1 !overflow-hidden !p-4' }"
  >
    <div class="mb-3 flex items-center justify-between">
      <div class="flex gap-2 items-center a-color-text">
        <div class="i-streamline-emojis-scroll text-lg" />
        <span class="whitespace-nowrap">农场日志</span>
      </div>
      <a-popover
        v-model:open="filterPopoverOpen"
        placement="bottomLeft"
        trigger="click"
      >
        <template #content>
          <div
            class="overscroll-contain flex flex-col gap-3 min-w-36"
            role="group"
          >
            <div class="flex flex-col gap-1.5">
              <label class="a-color-text-secondary text-xs">模块</label>
              <a-select
                :value="draftFilter.module"
                :options="MODULES"
                placeholder="选择模块"
                size="small"
                class="w-full"
                @update:value="v => setDraftField('module', String(v ?? ''))"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="a-color-text-secondary text-xs">事件</label>
              <a-select
                :value="draftFilter.event"
                :options="EVENTS"
                placeholder="选择事件"
                size="small"
                class="w-full"
                @update:value="v => setDraftField('event', String(v ?? ''))"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="a-color-text-secondary text-xs">级别</label>
              <a-select
                :value="draftFilter.isWarn"
                :options="LOG_LEVELS"
                placeholder="选择级别"
                size="small"
                class="w-full"
                @update:value="v => setDraftField('isWarn', String(v ?? ''))"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="a-color-text-secondary text-xs">关键词</label>
              <a-input
                :value="draftFilter.keyword"
                placeholder="输入关键词…"
                allow-clear
                size="small"
                class="w-full"
                @update:value="v => setDraftField('keyword', v ?? '')"
                @press-enter="applyQuery"
              />
            </div>
            <div class="mt-0.5 flex gap-2">
              <a-button
                size="small"
                class="flex-1"
                @click="resetFilter"
              >
                重置
              </a-button>
              <a-button
                type="primary"
                size="small"
                class="flex-1"
                @click="applyQuery"
              >
                查询
              </a-button>
            </div>
          </div>
        </template>
        <a-badge color="green" :dot="hasActiveFilter">
          <a-button
            type="text"
            size="small"
          >
            <div class="i-carbon-filter text-base" />
          </a-button>
        </a-badge>
      </a-popover>
    </div>

    <div
      ref="logContainer"
      class="leading-relaxed font-mono p-3 flex-1 max-h-[50vh] min-h-0 overflow-y-auto a-bg-layout rounded-lg md:max-h-none"
      @scroll="onLogScroll"
    >
      <div v-if="!logs.length" class="flex h-full items-center justify-center">
        <EmptyState icon="i-streamline-emojis-scroll text-4xl" description="暂无日志" />
      </div>
      <div v-for="log in logs" v-else :key="(log.createdAt ?? log.ts ?? 0) + (log.msg ?? '')" class="mb-1 break-all text-xs">
        <span class="mr-2 select-none a-color-text-tertiary">[{{ formatLogTime(log.time ?? '') }}]</span>
        <a-tag :color="log.tag === '错误' ? 'red' : log.isWarn ? 'orange' : 'green'" size="small" class="mr-1">
          {{ log.tag }}
        </a-tag>
        <a-tag v-if="log.meta?.event" color="processing" size="small" class="mr-1">
          {{ getEventLabel(log.meta.event) }}
        </a-tag>
        <span :class="log.tag === '错误' ? 'a-color-error' : log.isWarn ? 'a-color-warning' : 'a-color-text'">{{
          log.msg ?? ''
        }}</span>
      </div>
    </div>
  </a-card>
</template>
