<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { HIGHLIGHT_COLOR_MAP, METRIC_MAP, SORT_ICONS, SORT_OPTIONS, STRATEGY_CARD_COLORS } from '../constants'

type StrategyKey = 'exp' | 'fert' | 'profit' | 'fert_profit'

const props = defineProps<{
  list: any[]
}>()

const levelFilter = defineModel<number | null>('levelFilter', { required: true })

const isMobile = useMediaQuery('(max-width: 767px)')
const collapsed = ref(false)

watch(isMobile, (mobile) => {
  collapsed.value = mobile
}, { immediate: true })

const imageErrors = ref<Record<string | number, boolean>>({})

const strategies = computed(() => {
  return SORT_OPTIONS.filter(o => ['exp', 'fert', 'profit', 'fert_profit'].includes(o.value)) as Array<{ value: StrategyKey, label: string }>
})

const levelInput = computed<number | undefined>({
  get() {
    return typeof levelFilter.value === 'number' && Number.isFinite(levelFilter.value) ? levelFilter.value : undefined
  },
  set(v) {
    levelFilter.value = (typeof v === 'number' && Number.isFinite(v)) ? v : null
  }
})

const filteredByLevel = computed(() => {
  const lv = levelFilter.value
  const target = typeof lv === 'number' && Number.isFinite(lv) && lv > 0 ? lv : null
  if (!target)
    return props.list || []
  return (props.list || []).filter((row: any) => {
    const rowLv = Number(row?.level)
    // row.level 可能为 null；无等级限制的作物也允许展示
    if (!Number.isFinite(rowLv))
      return true
    return rowLv <= target
  })
})

const bestByStrategy = computed<Record<StrategyKey, any | null>>(() => {
  const src = filteredByLevel.value
  const out = { exp: null, fert: null, profit: null, fert_profit: null } as Record<StrategyKey, any | null>
  const keys: StrategyKey[] = ['exp', 'fert', 'profit', 'fert_profit']

  for (const key of keys) {
    const metric = METRIC_MAP[key]
    if (!metric) {
      out[key] = null
      continue
    }
    const arr = src.slice()
    arr.sort((a: any, b: any) => {
      const av = Number(a?.[metric])
      const bv = Number(b?.[metric])
      if (!Number.isFinite(av) && !Number.isFinite(bv))
        return 0
      if (!Number.isFinite(av))
        return 1
      if (!Number.isFinite(bv))
        return -1
      return bv - av
    })
    out[key] = arr[0] || null
  }

  return out
})

function getHighlightColor(key: StrategyKey): string {
  return HIGHLIGHT_COLOR_MAP[key] || 'var(--ant-color-text)'
}

function formatLv(level: any) {
  if (level === null || level === undefined || level === '' || Number(level) < 0)
    return '未知'
  return String(level)
}

function formatGrowTime(seconds: any) {
  const s = Number(seconds)
  if (!Number.isFinite(s) || s <= 0)
    return '0秒'
  if (s < 60)
    return `${s}秒`
  if (s < 3600) {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return secs > 0 ? `${mins}分${secs}秒` : `${mins}分`
  }
  const hours = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  return mins > 0 ? `${hours}时${mins}分` : `${hours}时`
}

function clearLevelFilter() {
  levelFilter.value = null
}
</script>

<template>
  <div class="border-b border-b-solid a-border-b-border-sec">
    <!-- Header -->
    <div class="px-4 py-3 flex flex-wrap gap-3 items-center justify-between">
      <div class="flex gap-2 select-none items-center">
        <a-button
          type="text"
          class="px-2 py-1 a-color-text-secondary rounded-md hover:!a-color-primary"
          @click="collapsed = !collapsed"
        >
          <div :class="collapsed ? 'i-carbon-chevron-right' : 'i-carbon-chevron-down'" />
        </a-button>
        <div class="flex gap-2 items-center">
          <div class="i-carbon-calculation a-color-primary text-lg" />
          <span class="font-semibold a-color-text">策略推荐</span>
        </div>
      </div>

      <div class="flex gap-2 items-center relative">
        <span class="a-color-text-tertiary text-xs">等级上限</span>
        <a-input-number
          v-model:value="levelInput"
          :min="1"
          :max="300"
          :precision="0"
          prefix="Lv"
          placeholder="不限"
          class="w-28 pr-6!"
          size="small"
          :controls="false"
        />
        <div
          v-if="levelFilter != null"
          class="i-carbon-close cursor-pointer right-0 right-1.5 top-1/2 absolute z-999 -translate-y-1/2"
          aria-label="清除等级上限"
          @click.stop.prevent="clearLevelFilter"
        />
      </div>
    </div>

    <!-- Body -->
    <div v-show="!collapsed" class="px-4 pb-4">
      <div class="gap-3 grid grid-cols-1 lg:grid-cols-4 sm:grid-cols-2">
        <a-card
          v-for="s in strategies"
          :key="s.value"
          size="small"
          class="overflow-hidden"
          :classes="{ body: '!p-3' }"
        >
          <template #title>
            <div class="flex gap-2 items-center">
              <div class="text-base" :class="SORT_ICONS[s.value]" />
              <span class="font-semibold a-color-text text-sm">{{ s.label }}</span>
              <span
                class="ml-auto px-2 py-0.5 a-color-text-tertiary a-bg-layout text-xs rounded"
                :class="`strategy-tag-${STRATEGY_CARD_COLORS[s.value]}`"
              >
                TOP1
              </span>
            </div>
          </template>

          <template #default>
            <div v-if="bestByStrategy[s.value]" class="flex gap-2.5 items-center">
              <div class="flex shrink-0 h-10 w-10 items-center justify-center overflow-hidden a-bg-layout rounded-lg">
                <img
                  v-if="bestByStrategy[s.value]?.image && !imageErrors[bestByStrategy[s.value]?.seedId]"
                  :src="bestByStrategy[s.value]?.image"
                  class="h-8 w-8 object-contain"
                  loading="lazy"
                  @error="imageErrors[bestByStrategy[s.value]?.seedId] = true"
                >
                <div v-else class="i-twemoji-seedling text-lg" />
              </div>

              <div class="flex-1 min-w-0">
                <div class="font-semibold truncate a-color-text text-sm">
                  {{ bestByStrategy[s.value]?.name }}
                </div>
                <div class="mt-1 flex gap-2 items-center">
                  <span class="a-color-text-tertiary text-xs">Lv{{ formatLv(bestByStrategy[s.value]?.level) }}</span>
                  <span class="a-color-text-tertiary text-xs">{{ formatGrowTime(bestByStrategy[s.value]?.growTime) }}</span>
                </div>

                <div class="mt-2">
                  <div class="a-color-text-tertiary text-xs">
                    关键指标
                  </div>
                  <div class="font-bold text-base" :style="{ color: getHighlightColor(s.value) }">
                    {{ bestByStrategy[s.value]?.[METRIC_MAP[s.value]] ?? '-' }}
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="py-4 flex items-center justify-center">
              <span class="a-color-text-tertiary text-xs">暂无数据</span>
            </div>
          </template>
        </a-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.strategy-tag-blue {
  background: rgba(59, 130, 246, 0.12);
  color: rgb(37, 99, 235);
}

.strategy-tag-cyan {
  background: rgba(6, 182, 212, 0.12);
  color: rgb(8, 145, 178);
}

.strategy-tag-orange {
  background: rgba(245, 158, 11, 0.14);
  color: rgb(217, 119, 6);
}

.strategy-tag-green {
  background: rgba(34, 197, 94, 0.14);
  color: rgb(22, 163, 74);
}
</style>
