<script setup lang="ts">
import type { BehaviorInspectResponse } from '@/api/types'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useBehaviorStore } from '@/stores'

const behaviorStore = useBehaviorStore()
const { inspect } = storeToRefs(behaviorStore)

const deviceSummary = computed(() => inspect.value?.device.runtime ?? inspect.value?.device.configured ?? null)

const deviceSourceLabelMap: Record<BehaviorInspectResponse['device']['configured']['source'], string> = {
  account_profile: '账号单独指定',
  global_default_profile: '全局默认设备',
  built_in_default_preset: '内置默认预设'
}

const selectedKindLabelMap: Record<BehaviorInspectResponse['device']['configured']['selectedKind'], string> = {
  preset: '内置预设',
  custom: '自定义设备'
}

const modeLabelMap: Record<BehaviorInspectResponse['effective']['effectiveMode'], string> = {
  'legacy': '旧逻辑模式',
  'balanced': '平衡模式',
  'full-humanized': '强拟人模式',
  'custom': '自定义模式'
}

const quietModeLabelMap: Record<BehaviorInspectResponse['scripts']['activeHours']['quietMode'], string> = {
  'disconnect': '静默时断开',
  'heartbeat-only': '仅保留心跳'
}

const deviceSourceLabel = computed(() => (
  deviceSummary.value ? deviceSourceLabelMap[deviceSummary.value.source] : '-'
))

const selectedKindLabel = computed(() => (
  deviceSummary.value ? selectedKindLabelMap[deviceSummary.value.selectedKind] : '-'
))

const effectiveModeLabel = computed(() => (
  inspect.value ? modeLabelMap[inspect.value.effective.effectiveMode] : '-'
))

const activeHoursLabel = computed(() => {
  if (!inspect.value)
    return '-'
  if (!inspect.value.scripts.activeHours.enabled)
    return '关闭'
  const quietModeLabel = quietModeLabelMap[inspect.value.scripts.activeHours.quietMode]
  const windowLabel = inspect.value.scripts.activeHours.currentlyInActiveWindow ? '当前在活跃窗' : '当前不在活跃窗'
  return `${quietModeLabel} / ${windowLabel}`
})

const fallbackHint = computed(() => {
  if (!deviceSummary.value)
    return '-'
  if (!deviceSummary.value.fallbackFields.length)
    return '未触发 fallback，当前设备字段全部来自选中设备或预设基底。'
  return `已触发 fallback：${deviceSummary.value.fallbackFields.join(' / ')}`
})

const summarySourceLabel = computed(() => (
  inspect.value?.device.runtime ? '运行态摘要' : '配置态摘要'
))

function formatRange(range: { min: number, max: number }): string {
  return `${range.min}ms - ${range.max}ms`
}
</script>

<template>
  <a-card variant="borderless" class="shrink-0" :classes="{ body: '!p-4', header: '!min-h-11 !px-4' }">
    <template #title>
      <div class="font-bold flex gap-2 items-center">
        <div class="i-streamline-emojis-magnifying-glass-tilted-left" />
        风控检查摘要
      </div>
    </template>

    <div v-if="inspect" class="space-y-5">
      <fieldset>
        <legend class="tracking-wide font-medium mb-2 op-50 uppercase text-xs">
          最终设备
        </legend>
        <div class="mb-3 a-color-text-tertiary text-sm">
          当前显示的是{{ summarySourceLabel }}，优先使用运行中账号的实际摘要；若账号未运行，则回退到配置解析结果。
        </div>
        <div class="gap-x-4 gap-y-3 grid grid-cols-1 md:grid-cols-2">
          <div>
            <div class="a-color-text-tertiary text-xs">
              来源
            </div>
            <div>{{ deviceSourceLabel }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              选中类型
            </div>
            <div>{{ selectedKindLabel }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              选中项
            </div>
            <div>{{ deviceSummary?.selectedProfileId || deviceSummary?.basePresetId || '-' }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              平台 / OS
            </div>
            <div>{{ deviceSummary?.client.platform || '-' }} / {{ deviceSummary?.client.os || '-' }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              机型
            </div>
            <div>{{ deviceSummary?.client.sysHardware || '-' }}</div>
          </div>
          <div class="md:col-span-2">
            <div class="a-color-text-tertiary text-xs">
              Fallback 字段
            </div>
            <div>{{ deviceSummary?.fallbackFields.length ? deviceSummary.fallbackFields.join(' / ') : '无' }}</div>
          </div>
          <div class="md:col-span-2">
            <div class="a-color-text-tertiary text-xs">
              解释
            </div>
            <div>{{ fallbackHint }}</div>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend class="tracking-wide font-medium mb-2 op-50 uppercase text-xs">
          行为脚本
        </legend>
        <div class="gap-x-4 gap-y-3 grid grid-cols-1 md:grid-cols-2">
          <div>
            <div class="a-color-text-tertiary text-xs">
              当前模式
            </div>
            <div>{{ effectiveModeLabel }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              快速回退
            </div>
            <div>{{ inspect.scripts.quickFallbackActive ? '开启' : '关闭' }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              热身脚本
            </div>
            <div>{{ inspect.scripts.sessionBootstrap.enabled ? `开启 / ${inspect.scripts.sessionBootstrap.requestCount} 个固定请求` : '关闭' }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              背景请求脚本
            </div>
            <div>{{ inspect.scripts.backgroundRequests.enabled ? `开启 / 每 ${inspect.scripts.backgroundRequests.frequency} 次操作触发` : '关闭' }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              固定步长限制
            </div>
            <div>{{ inspect.scripts.sessionBootstrap.pacing.legacyStepMs }}ms / {{ inspect.scripts.sessionBootstrap.pacing.maxStepMs }}ms</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              活跃时段
            </div>
            <div>{{ activeHoursLabel }}</div>
          </div>
          <div class="md:col-span-2">
            <div class="a-color-text-tertiary text-xs">
              脚本边界
            </div>
            <div>
              热身请求池、背景请求池和固定步长上限属于内置脚本；页面自定义参数不会逐条改写这些内置列表。
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend class="tracking-wide font-medium mb-2 op-50 uppercase text-xs">
          请求出口
        </legend>
        <div class="gap-x-4 gap-y-3 grid grid-cols-1 md:grid-cols-2">
          <div>
            <div class="a-color-text-tertiary text-xs">
              统一网关
            </div>
            <div>{{ inspect.requestPacing.unifiedGatewayEnabled ? '开启' : '关闭' }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              队列
            </div>
            <div>{{ inspect.requestPacing.queues.join(' / ') }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              静默时段闸门
            </div>
            <div>{{ inspect.requestPacing.quietHoursGateAppliesToBusinessTraffic ? '作用于业务请求' : '不作用于业务请求' }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              忙时脚本降级
            </div>
            <div>{{ inspect.requestPacing.dropLowPriorityScriptRequestsWhenBusy ? '低优先级脚本可丢弃' : '关闭' }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              农场读 / 写
            </div>
            <div>{{ formatRange(inspect.requestPacing.categoryPolicyRanges.farmRead) }} / {{ formatRange(inspect.requestPacing.categoryPolicyRanges.farmWrite) }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              好友访问 / 交互
            </div>
            <div>{{ formatRange(inspect.requestPacing.categoryPolicyRanges.friendVisit) }} / {{ formatRange(inspect.requestPacing.categoryPolicyRanges.friendWrite) }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              仓库写操作
            </div>
            <div>{{ formatRange(inspect.requestPacing.categoryPolicyRanges.warehouseWrite) }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              任务 / 日常奖励
            </div>
            <div>{{ formatRange(inspect.requestPacing.categoryPolicyRanges.taskClaim) }} / {{ formatRange(inspect.requestPacing.categoryPolicyRanges.dailyReward) }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              热身脚本
            </div>
            <div>{{ formatRange(inspect.requestPacing.categoryPolicyRanges.bootstrap) }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              背景请求
            </div>
            <div>{{ formatRange(inspect.requestPacing.categoryPolicyRanges.background) }}</div>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend class="tracking-wide font-medium mb-2 op-50 uppercase text-xs">
          运行时协调
        </legend>
        <div class="gap-x-4 gap-y-3 grid grid-cols-1 md:grid-cols-2">
          <div>
            <div class="a-color-text-tertiary text-xs">
              统一协调层
            </div>
            <div>{{ inspect.runtimeCoordination.unifiedCoordinatorEnabled ? '开启' : '关闭' }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              登录热身生命周期
            </div>
            <div>{{ inspect.runtimeCoordination.session.bootstrapEnabled ? '开启' : '关闭' }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              冷启动停顿
            </div>
            <div>{{ inspect.runtimeCoordination.session.coldStartEnabled ? formatRange(inspect.runtimeCoordination.session.coldStartRange) : '关闭' }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              操作后停留
            </div>
            <div>{{ inspect.runtimeCoordination.session.lingerEnabled ? formatRange(inspect.runtimeCoordination.session.lingerRange) : '关闭' }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              空闲断开
            </div>
            <div>{{ inspect.runtimeCoordination.session.idleDisconnectEnabled ? formatRange(inspect.runtimeCoordination.session.idleDisconnectRange) : '关闭' }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              多账号启动抖动
            </div>
            <div>{{ inspect.runtimeCoordination.multiAccount.startJitterEnabled ? formatRange(inspect.runtimeCoordination.multiAccount.startJitterRange) : '关闭' }}</div>
          </div>
          <div>
            <div class="a-color-text-tertiary text-xs">
              多账号调度错峰
            </div>
            <div>{{ inspect.runtimeCoordination.multiAccount.scheduleOffsetEnabled ? formatRange(inspect.runtimeCoordination.multiAccount.scheduleOffsetRange) : '关闭' }}</div>
          </div>
        </div>
      </fieldset>

      <div class="a-color-text-tertiary text-sm">
        这里展示的是最终生效摘要。热身请求池、背景请求池和固定步长上限属于内置脚本，不跟随普通自定义参数逐项变化。
      </div>
    </div>

    <div v-else class="py-4 a-color-text-tertiary text-sm">
      暂无检查摘要，请先加载当前账号配置。
    </div>
  </a-card>
</template>
