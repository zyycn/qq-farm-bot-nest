<script setup lang="ts">
import type { BehaviorActiveHoursWindow, BehaviorMode } from '@qq-farm/shared'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useBehaviorStore } from '@/stores'
import { ACTIVE_HOURS_QUIET_MODE_OPTIONS, BEHAVIOR_MODE_OPTIONS } from '../constants'

const behaviorStore = useBehaviorStore()
const { config } = storeToRefs(behaviorStore)

const isCustomMode = computed(() => config.value.mode === 'custom')
const effectiveModeLabel = computed(() => (
  config.value.enabled ? config.value.mode : 'legacy (快速回退中)'
))

const modeHintMap: Record<BehaviorMode, string> = {
  'legacy': '最接近旧逻辑，弱化类人化增强。',
  'balanced': '推荐默认模式，在稳定性和拟人化之间取平衡。',
  'full-humanized': '更强的抖动、停顿和分批节奏，拟人化更明显。',
  'custom': '使用下方自定义参数，按账号细调。'
}

function addActiveWindow(): void {
  config.value.activeHours.windows.push({ start: '07:00', end: '23:59' })
}

function removeActiveWindow(index: number): void {
  if (config.value.activeHours.windows.length <= 1) {
    config.value.activeHours.windows = [{ start: '07:00', end: '23:59' }]
    return
  }
  config.value.activeHours.windows.splice(index, 1)
}

function updateActiveWindow(index: number, patch: Partial<BehaviorActiveHoursWindow>): void {
  const current = config.value.activeHours.windows[index]
  if (!current)
    return
  config.value.activeHours.windows[index] = { ...current, ...patch }
}

function normalizeTimeValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value ? value : fallback
}

function updateActiveWindowStart(index: number, value: unknown): void {
  updateActiveWindow(index, { start: normalizeTimeValue(value, '00:00') })
}

function updateActiveWindowEnd(index: number, value: unknown): void {
  updateActiveWindow(index, { end: normalizeTimeValue(value, '23:59') })
}
</script>

<template>
  <a-card variant="borderless" class="shrink-0" :classes="{ body: '!p-4', header: '!min-h-11 !px-4' }">
    <template #title>
      <div class="font-bold flex gap-2 items-center">
        <div class="i-streamline-emojis-man-farmer-1" />
        类人行为模拟
      </div>
    </template>

    <div class="space-y-5">
      <fieldset>
        <legend class="tracking-wide font-medium mb-2 op-50 uppercase text-xs">
          模式
        </legend>
        <div class="gap-x-4 gap-y-3 grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr]">
          <a-form layout="vertical">
            <a-form-item label="行为模式">
              <a-select v-model:value="config.mode" :options="BEHAVIOR_MODE_OPTIONS" />
            </a-form-item>
          </a-form>

          <div class="py-1 flex flex-col justify-between">
            <label class="flex gap-2 cursor-pointer select-none items-center">
              <a-switch v-model:checked="config.enabled" size="small" />
              <span>快速回退开关</span>
            </label>
            <div class="a-color-text-tertiary text-sm">
              关闭后会回退统一请求出口和运行时协调层的增强策略，
              activeHours 仍按自己的子开关单独生效。
            </div>
          </div>
        </div>

        <div class="mt-2 px-3 py-2 bg-[rgba(0,0,0,0.03)] text-sm rounded-lg">
          <div>当前选择: {{ config.mode }}</div>
          <div>当前生效: {{ effectiveModeLabel }}</div>
          <div class="mt-1 a-color-text-tertiary">
            {{ modeHintMap[config.mode] }}
          </div>
          <div class="mt-1 a-color-text-tertiary">
            登录热身和背景请求属于内置脚本；这里配置的是映射到统一请求出口与运行时协调层的策略，不直接编辑请求池、固定顺序或脚本步长上限。
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend class="tracking-wide font-medium mb-2 op-50 uppercase text-xs">
          活跃时段
        </legend>
        <div class="space-y-3">
          <div class="flex flex-wrap gap-4 items-center">
            <label class="flex gap-2 cursor-pointer select-none items-center">
              <a-switch v-model:checked="config.activeHours.enabled" size="small" />
              <span>启用活跃时段限制</span>
            </label>
            <div class="w-220px">
              <a-select
                v-model:value="config.activeHours.quietMode"
                :options="ACTIVE_HOURS_QUIET_MODE_OPTIONS"
                :disabled="!config.activeHours.enabled"
              />
            </div>
          </div>

          <div class="space-y-2">
            <div
              v-for="(window, index) in config.activeHours.windows"
              :key="`${index}-${window.start}-${window.end}`"
              class="gap-2 grid grid-cols-[1fr_auto_1fr_auto] items-center"
            >
              <a-time-picker
                :value="window.start"
                format="HH:mm"
                value-format="HH:mm"
                :disabled="!config.activeHours.enabled"
                @update:value="value => updateActiveWindowStart(index, value)"
              />
              <span class="text-center a-color-text-tertiary">至</span>
              <a-time-picker
                :value="window.end"
                format="HH:mm"
                value-format="HH:mm"
                :disabled="!config.activeHours.enabled"
                @update:value="value => updateActiveWindowEnd(index, value)"
              />
              <a-button
                size="small"
                :disabled="!config.activeHours.enabled"
                @click="removeActiveWindow(index)"
              >
                删除
              </a-button>
            </div>
          </div>

          <a-button size="small" :disabled="!config.activeHours.enabled" @click="addActiveWindow">
            新增时段
          </a-button>
        </div>
      </fieldset>

      <fieldset>
        <legend class="tracking-wide font-medium mb-2 op-50 uppercase text-xs">
          自定义增强参数
        </legend>
        <div class="mb-3 a-color-text-tertiary text-sm">
          只有在 `custom` 模式下，下列参数才会作为最终生效值；其它模式会使用预设。
          这些参数不会散落到业务逻辑里，而是映射到统一请求出口和运行时协调层。
        </div>

        <div class="space-y-4">
          <div class="gap-x-3 gap-y-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
            <a-form layout="vertical">
              <a-form-item label="快速批量最小延迟 (ms)">
                <a-input-number v-model:value="config.delay.rapidBatchMin" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="快速批量最大延迟 (ms)">
                <a-input-number v-model:value="config.delay.rapidBatchMax" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="普通操作最小延迟 (ms)">
                <a-input-number v-model:value="config.delay.actionMin" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="普通操作最大延迟 (ms)">
                <a-input-number v-model:value="config.delay.actionMax" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="批次切换最小延迟 (ms)">
                <a-input-number v-model:value="config.delay.batchMin" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="批次切换最大延迟 (ms)">
                <a-input-number v-model:value="config.delay.batchMax" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="任务切换最小延迟 (ms)">
                <a-input-number v-model:value="config.delay.taskSwitchMin" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="任务切换最大延迟 (ms)">
                <a-input-number v-model:value="config.delay.taskSwitchMax" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="好友切换最小延迟 (ms)">
                <a-input-number v-model:value="config.delay.friendSwitchMin" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="好友切换最大延迟 (ms)">
                <a-input-number v-model:value="config.delay.friendSwitchMax" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
          </div>

          <div class="gap-x-6 gap-y-3 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
            <label class="flex gap-2 cursor-pointer select-none items-center">
              <a-switch v-model:checked="config.rhythm.enableGradualPace" :disabled="!isCustomMode" size="small" />
              <span>渐变节奏</span>
            </label>
            <label class="flex gap-2 cursor-pointer select-none items-center">
              <a-switch v-model:checked="config.rhythm.enableRandomPause" :disabled="!isCustomMode" size="small" />
              <span>随机停顿</span>
            </label>
            <label class="flex gap-2 cursor-pointer select-none items-center">
              <a-switch v-model:checked="config.rhythm.enableOrderShuffle" :disabled="!isCustomMode" size="small" />
              <span>随机顺序</span>
            </label>
          </div>

          <div class="gap-x-3 gap-y-3 grid grid-cols-1 md:grid-cols-3">
            <a-form layout="vertical">
              <a-form-item label="随机停顿概率">
                <a-input-number v-model:value="config.rhythm.pauseProbability" :disabled="!isCustomMode" :min="0" :max="1" :step="0.01" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="随机停顿最小值 (ms)">
                <a-input-number v-model:value="config.rhythm.pauseMin" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="随机停顿最大值 (ms)">
                <a-input-number v-model:value="config.rhythm.pauseMax" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
          </div>

          <div class="gap-x-6 gap-y-3 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
            <label class="flex gap-2 cursor-pointer select-none items-center">
              <a-switch v-model:checked="config.session.enableColdStart" :disabled="!isCustomMode" size="small" />
              <span>冷启动停顿</span>
            </label>
            <label class="flex gap-2 cursor-pointer select-none items-center">
              <a-switch v-model:checked="config.session.enableLingerAfterOps" :disabled="!isCustomMode" size="small" />
              <span>操作后停留</span>
            </label>
            <label class="flex gap-2 cursor-pointer select-none items-center">
              <a-switch v-model:checked="config.session.enableIdleDisconnect" :disabled="!isCustomMode" size="small" />
              <span>空闲断开</span>
            </label>
            <label class="flex gap-2 cursor-pointer select-none items-center">
              <a-switch v-model:checked="config.session.enableSessionBootstrap" :disabled="!isCustomMode" size="small" />
              <span>登录热身序列</span>
            </label>
          </div>

          <div class="gap-x-3 gap-y-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
            <a-form layout="vertical">
              <a-form-item label="冷启动最小值 (ms)">
                <a-input-number v-model:value="config.session.coldStartMin" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="冷启动最大值 (ms)">
                <a-input-number v-model:value="config.session.coldStartMax" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="停留最小值 (ms)">
                <a-input-number v-model:value="config.session.lingerMin" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="停留最大值 (ms)">
                <a-input-number v-model:value="config.session.lingerMax" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="空闲断开最小值 (ms)">
                <a-input-number v-model:value="config.session.idleDisconnectMin" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="空闲断开最大值 (ms)">
                <a-input-number v-model:value="config.session.idleDisconnectMax" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
          </div>

          <div class="gap-x-6 gap-y-3 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
            <label class="flex gap-2 cursor-pointer select-none items-center">
              <a-switch v-model:checked="config.friend.enableRandomSkip" :disabled="!isCustomMode" size="small" />
              <span>随机跳过好友</span>
            </label>
            <label class="flex gap-2 cursor-pointer select-none items-center">
              <a-switch v-model:checked="config.friend.enableBatchLimit" :disabled="!isCustomMode" size="small" />
              <span>好友分批访问</span>
            </label>
            <label class="flex gap-2 cursor-pointer select-none items-center">
              <a-switch v-model:checked="config.multiAccount.enableStartJitter" :disabled="!isCustomMode" size="small" />
              <span>多账号启动抖动</span>
            </label>
            <label class="flex gap-2 cursor-pointer select-none items-center">
              <a-switch v-model:checked="config.multiAccount.enableScheduleOffset" :disabled="!isCustomMode" size="small" />
              <span>多账号调度错峰</span>
            </label>
            <label class="flex gap-2 cursor-pointer select-none items-center">
              <a-switch v-model:checked="config.backgroundRequests.enabled" :disabled="!isCustomMode" size="small" />
              <span>背景装饰请求</span>
            </label>
          </div>

          <div class="gap-x-3 gap-y-3 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5">
            <a-form layout="vertical">
              <a-form-item label="跳过好友概率">
                <a-input-number v-model:value="config.friend.skipProbability" :disabled="!isCustomMode" :min="0" :max="1" :step="0.01" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="好友分批大小">
                <a-input-number v-model:value="config.friend.batchSize" :disabled="!isCustomMode" :min="1" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="分批休息最小值 (ms)">
                <a-input-number v-model:value="config.friend.batchRestMin" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="分批休息最大值 (ms)">
                <a-input-number v-model:value="config.friend.batchRestMax" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="背景请求频率">
                <a-input-number v-model:value="config.backgroundRequests.frequency" :disabled="!isCustomMode" :min="1" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="启动抖动最小值 (ms)">
                <a-input-number v-model:value="config.multiAccount.startJitterMin" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="启动抖动最大值 (ms)">
                <a-input-number v-model:value="config.multiAccount.startJitterMax" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="错峰偏移最小值 (ms)">
                <a-input-number v-model:value="config.multiAccount.scheduleOffsetMin" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="错峰偏移最大值 (ms)">
                <a-input-number v-model:value="config.multiAccount.scheduleOffsetMax" :disabled="!isCustomMode" :min="0" class="w-full" />
              </a-form-item>
            </a-form>
          </div>
        </div>
      </fieldset>
    </div>
  </a-card>
</template>
