<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useStrategyStore } from '@/stores'

const strategyStore = useStrategyStore()
const { settings } = storeToRefs(strategyStore)
</script>

<template>
  <a-card variant="borderless" class="shrink-0" :classes="{ body: '!p-4', header: '!min-h-11 !px-4' }">
    <template #title>
      <div class="font-bold flex gap-2 items-center">
        <div class="i-twemoji-seven-oclock" />
        巡查间隔
      </div>
    </template>

    <!-- 巡查间隔 -->
    <fieldset>
      <legend class="tracking-wide font-medium mb-2 op-50 uppercase text-xs">
        农场 & 好友(主动轮询)
      </legend>
      <div class="gap-x-3 gap-y-3 grid grid-cols-2 lg:grid-cols-4">
        <a-form layout="vertical">
          <a-form-item label="农场最小 (秒)">
            <a-input-number v-model:value="settings.intervals.farmMin" :min="1" style="width: 100%" />
          </a-form-item>
        </a-form>
        <a-form layout="vertical">
          <a-form-item label="农场最大 (秒)">
            <a-input-number v-model:value="settings.intervals.farmMax" :min="1" style="width: 100%" />
          </a-form-item>
        </a-form>
        <a-form layout="vertical">
          <a-form-item label="好友最小 (秒)">
            <a-input-number v-model:value="settings.intervals.friendMin" :min="1" style="width: 100%" />
          </a-form-item>
        </a-form>
        <a-form layout="vertical">
          <a-form-item label="好友最大 (秒)">
            <a-input-number v-model:value="settings.intervals.friendMax" :min="1" style="width: 100%" />
          </a-form-item>
        </a-form>
      </div>
    </fieldset>

    <!-- 好友静默时段 -->
    <fieldset>
      <legend class="tracking-wide font-medium mb-2 op-50 uppercase text-xs">
        好友静默时段
      </legend>
      <div class="flex flex-wrap gap-4 items-center">
        <label class="flex gap-2 cursor-pointer select-none items-center">
          <a-switch v-model:checked="settings.friendQuietHours.enabled" size="small" />
          <span>启用好友静默时段</span>
        </label>
        <div class="flex gap-2 items-center">
          <a-time-picker
            v-model:value="settings.friendQuietHours.start"
            class="w-28"
            :disabled="!settings.friendQuietHours.enabled"
            format="HH:mm"
            value-format="HH:mm"
          />
          <span class="a-color-text-tertiary">—</span>
          <a-time-picker
            v-model:value="settings.friendQuietHours.end"
            class="w-28"
            :disabled="!settings.friendQuietHours.enabled"
            format="HH:mm"
            value-format="HH:mm"
          />
        </div>
      </div>
    </fieldset>
  </a-card>
</template>
