<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useSettingStore } from '@/stores'
import { CHANNEL_DOCS, CHANNEL_OPTIONS, RELOGIN_URL_MODE_OPTIONS } from '../constants'

defineProps<{
  saving: boolean
}>()

const emit = defineEmits<{
  save: []
}>()

function handleSave() {
  emit('save')
}

const settingStore = useSettingStore()
const { settings } = storeToRefs(settingStore)

const currentChannelDocUrl = computed(() => {
  const key = String(settings.value.offlineReminder.channel || '')
    .trim()
    .toLowerCase()
  return CHANNEL_DOCS[key] || ''
})

function openChannelDocs() {
  const url = currentChannelDocUrl.value
  if (!url)
    return
  window.open(url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <a-card variant="borderless" :classes="{ body: '!p-4' }">
    <div class="flex items-center justify-between">
      <div class="font-bold flex gap-2 items-center a-color-text">
        <div class="i-twemoji-bell" />
        下线提醒
      </div>
      <a-button type="primary" size="small" :loading="saving" @click="handleSave">
        保存提醒设置
      </a-button>
    </div>
    <a-form layout="vertical">
      <div class="gap-x-3 grid grid-cols-2">
        <a-form-item label="推送渠道">
          <div class="flex gap-2 items-center">
            <a-select v-model:value="settings.offlineReminder.channel" :options="CHANNEL_OPTIONS" class="flex-1" />
            <a-tooltip v-if="currentChannelDocUrl" title="查看渠道文档" placement="top">
              <a-button size="small" @click="openChannelDocs">
                <div class="i-twemoji-open-book" />
              </a-button>
            </a-tooltip>
          </div>
        </a-form-item>
        <a-form-item label="重登录链接">
          <a-select v-model:value="settings.offlineReminder.reloginUrlMode" :options="RELOGIN_URL_MODE_OPTIONS" />
        </a-form-item>
      </div>
      <div class="gap-x-3 grid grid-cols-2">
        <a-form-item label="接口地址">
          <a-input v-model:value="settings.offlineReminder.endpoint" :disabled="settings.offlineReminder.channel !== 'webhook'" />
        </a-form-item>
        <a-form-item label="Token">
          <a-input v-model:value="settings.offlineReminder.token" placeholder="接收端 token" />
        </a-form-item>
      </div>
      <div class="gap-x-3 grid grid-cols-3">
        <a-form-item label="标题">
          <a-input v-model:value="settings.offlineReminder.title" placeholder="提醒标题" />
        </a-form-item>
        <a-form-item label="离线删除(秒)">
          <a-input-number
            v-model:value="settings.offlineReminder.offlineDeleteSec"
            :min="1"
            placeholder="120"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="内容">
          <a-input v-model:value="settings.offlineReminder.msg" placeholder="提醒内容" />
        </a-form-item>
      </div>
    </a-form>
  </a-card>
</template>
