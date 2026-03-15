<script setup lang="ts">
import type { AlmanacSummary } from '@/api/modules/almanac'
import { computed } from 'vue'

const props = defineProps<{
  summary: AlmanacSummary
  loading: boolean
  claiming: boolean
}>()

const emit = defineEmits<{
  refresh: []
  claim: []
}>()

const rewardPreview = computed(() => props.summary.rewardBoxPreview ?? props.summary.rewardHint)

const rewardHintText = computed(() => {
  if (!rewardPreview.value)
    return 'No reward preview returned yet.'
  return `Preview: ${rewardPreview.value.name} x${rewardPreview.value.count}`
})

const rewardStatusText = computed(() => {
  if (props.summary.rewardBoxClaimableRaw)
    return 'field8 matched: chest is claimable right now and the red dot should be visible.'
  if (props.summary.rewardBoxVisible)
    return 'field9 is still visible: this is a visible-only chest state, not claimable yet.'
  return 'No live chest red dot. reward_flag is kept as a diagnostic field only.'
})

const rewardBoxStateText = computed(() => {
  if (props.summary.rewardBoxClaimableRaw)
    return 'claimable'
  if (props.summary.rewardBoxVisible)
    return 'visible only'
  return 'inactive'
})

const rewardProtocolText = computed(() => `field8=${props.summary.rewardBoxClaimableRaw ? 1 : 0} / field9=${props.summary.rewardBoxVisible ? 1 : 0} / reward_flag=${props.summary.rewardFlag}`)

const claimDisabled = computed(() => props.loading || props.claiming || !props.summary.rewardBoxClaimable)
const progressCurrent = computed(() => Math.max(0, props.summary.exp))
const progressNeeded = computed(() => Math.max(progressCurrent.value, props.summary.nextLevelExp || 0))
</script>

<template>
  <a-card variant="borderless" :classes="{ body: '!p-0' }">
    <div class="rounded-[inherit] relative overflow-hidden from-[#fff9e8] to-[#fff4df] via-[#fff7ef] bg-gradient-to-br">
      <div class="bg-[radial-gradient(circle_at_top_right,rgba(255,216,128,0.28),transparent_38%)] inset-0 absolute" />
      <div class="p-4 flex flex-col gap-4 relative sm:p-5 lg:flex-row lg:items-stretch lg:justify-between">
        <div class="flex flex-1 flex-col gap-4">
          <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div class="flex gap-4 items-center">
              <div class="flex shrink-0 flex-col h-18 w-18 items-center justify-center from-[#f9d28b] to-[#efb366] bg-gradient-to-br rounded-3xl shadow-sm">
                <span class="text-[#7b4a20] tracking-[0.12em] font-medium uppercase text-xs">Lv</span>
                <span class="text-[#7b4a20] leading-none font-bold text-2xl">{{ summary.level || 0 }}</span>
              </div>
              <div class="min-w-0">
                <div class="font-semibold a-color-text text-lg">
                  我的图鉴
                </div>
                <div class="mt-1 a-color-text-secondary text-sm">
                  {{ rewardStatusText }}
                </div>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <a-button :loading="loading" @click="emit('refresh')">
                刷新
              </a-button>
              <a-button type="primary" :loading="claiming" :disabled="claimDisabled" @click="emit('claim')">
                领取宝箱
              </a-button>
            </div>
          </div>

          <div class="p-4 border-white/70 bg-white/80 backdrop-blur-sm border rounded-2xl shadow-sm">
            <div class="flex flex-wrap gap-2 items-center justify-between a-color-text-secondary text-sm">
              <span class="flex gap-1.5 items-center">
                <span class="i-streamline-emojis-sparkles" />
                图鉴经验进度
              </span>
              <span>{{ progressCurrent }} / {{ progressNeeded || '?' }}</span>
            </div>
            <a-progress
              class="mt-3"
              :percent="summary.progressPercent || 0"
              :show-info="false"
              size="small"
              stroke-color="var(--ant-color-success)"
            />

            <div class="mt-4 gap-2 grid sm:grid-cols-3">
              <div class="px-3 py-2 a-bg-layout rounded-2xl">
                <div class="a-color-text-tertiary text-xs">
                  已点亮
                </div>
                <div class="font-semibold mt-1 a-color-text">
                  {{ summary.litCount }} / {{ summary.totalCount }}
                </div>
              </div>
              <div class="px-3 py-2 a-bg-layout rounded-2xl">
                <div class="a-color-text-tertiary text-xs">
                  新宝标记
                </div>
                <div class="font-semibold mt-1 a-color-text">
                  {{ summary.newCount }}
                </div>
              </div>
              <div class="px-3 py-2 a-bg-layout rounded-2xl">
                <div class="a-color-text-tertiary text-xs">
                  宝箱状态
                </div>
                <div class="font-semibold mt-1 a-color-text">
                  {{ rewardBoxStateText }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="lg:w-76">
          <div class="p-4 border-white/80 bg-white/80 backdrop-blur-sm border rounded-3xl shadow-sm">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-semibold a-color-text text-sm">
                  宝箱概览
                </div>
                <div class="mt-1 a-color-text-tertiary text-xs">
                  field4 是奖励预览，field8 / field9 是 live 协议状态位
                </div>
              </div>
              <div class="flex h-12 w-12 items-center justify-center relative from-[#ffe9a8] to-[#ffc973] bg-gradient-to-br text-xl rounded-2xl shadow-sm">
                <span class="i-streamline-emojis-sparkles" />
                <span
                  v-if="summary.rewardBoxRedDot"
                  class="rounded-full bg-[#ff5a5f] h-2.5 w-2.5 ring-2 ring-white/90 right-0.5 top-0.5 absolute"
                />
              </div>
            </div>

            <div class="mt-4 p-3 a-bg-layout rounded-2xl">
              <div class="a-color-text-tertiary text-xs">
                宝箱提示
              </div>
              <div class="leading-6 font-medium mt-2 a-color-text">
                {{ rewardHintText }}
              </div>
              <div class="mt-2 a-color-text-tertiary text-xs">
                {{ rewardProtocolText }}
              </div>
            </div>

            <div class="mt-4 gap-2 grid lg:grid-cols-1 sm:grid-cols-3 xl:grid-cols-3">
              <div class="px-3 py-2 a-bg-layout rounded-2xl">
                <div class="a-color-text-tertiary text-xs">
                  普通图鉴
                </div>
                <div class="font-semibold mt-1 a-color-text">
                  {{ summary.categoryCounts.normal }}
                </div>
              </div>
              <div class="px-3 py-2 a-bg-layout rounded-2xl">
                <div class="a-color-text-tertiary text-xs">
                  珍藏图鉴
                </div>
                <div class="font-semibold mt-1 a-color-text">
                  {{ summary.categoryCounts.treasure }}
                </div>
              </div>
              <div class="px-3 py-2 a-bg-layout rounded-2xl">
                <div class="a-color-text-tertiary text-xs">
                  其他条目
                </div>
                <div class="font-semibold mt-1 a-color-text">
                  {{ summary.categoryCounts.unknown }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </a-card>
</template>
