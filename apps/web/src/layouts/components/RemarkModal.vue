<script setup lang="ts">
import { ref, watch } from 'vue'
import { ws } from '@/api'
import QqAvatar from '@/components/QqAvatar.vue'

const props = defineProps<{
  show: boolean
  account?: any
}>()

const emit = defineEmits(['close', 'saved'])

function handleClose() {
  emit('close')
}

const name = ref('')
const loading = ref(false)
const errorMessage = ref('')

watch(
  () => props.show,
  (val) => {
    errorMessage.value = ''
    if (val && props.account) {
      name.value = props.account.name || ''
    }
  }
)

async function save() {
  if (!props.account)
    return
  loading.value = true
  errorMessage.value = ''
  try {
    await ws.request('account:remark', { uin: props.account.uin, name: name.value })
    emit('saved')
    emit('close')
  } catch (e: any) {
    errorMessage.value = `保存失败: ${e.message}`
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <a-modal
    :open="show"
    :footer="null"
    :width="380"
    :mask-closable="!loading"
    centered
    destroy-on-hidden
    @cancel="handleClose"
  >
    <template #title>
      <div class="flex gap-2 items-center">
        <div class="i-twemoji-label text-lg" />
        <span>修改备注</span>
      </div>
    </template>

    <div
      v-if="errorMessage"
      class="mb-4 px-3 py-2 opacity-90 flex gap-2 items-center a-color-white a-bg-error rounded-lg"
    >
      <div class="i-twemoji-warning shrink-0" />
      {{ errorMessage }}
    </div>

    <div v-if="account" class="mb-4 px-3 py-2.5 flex gap-3 items-center a-bg-layout rounded-lg">
      <QqAvatar :src="account.avatar" :uin="account.uin" :size="36" ring />
      <div class="flex flex-1 flex-col gap-0.5 min-w-0">
        <div class="truncate">
          {{ account.nick }}
        </div>
        <div class="a-color-text-tertiary text-sm">
          {{ account.name || account.uid || '未命名' }}
        </div>
      </div>
    </div>

    <a-form layout="vertical">
      <a-form-item label="备注名称">
        <a-input v-model:value="name" placeholder="请输入备注名称" @press-enter="save">
          <template #prefix>
            <div class="i-twemoji-memo" />
          </template>
        </a-input>
      </a-form-item>
    </a-form>

    <div class="flex gap-2 items-center justify-end a-border-t-border-sec">
      <a-button :disabled="loading" @click="handleClose">
        取消
      </a-button>
      <a-button type="primary" :loading="loading" @click="save">
        <template v-if="!loading" #icon>
          <div class="i-twemoji-check-mark-button" />
        </template>
        保存
      </a-button>
    </div>
  </a-modal>
</template>
