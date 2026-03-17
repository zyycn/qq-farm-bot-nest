<script setup lang="ts">
import { ref, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'

interface BagSeedItem {
  seedId: number
  name: string
  count?: number
  requiredLevel?: number
  image?: string
  plantSize?: number
}

const props = defineProps<{
  open: boolean
  loading: boolean
  seeds: BagSeedItem[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'refresh': []
  'reset': []
  'update:seeds': [value: BagSeedItem[]]
}>()

const innerOpen = ref(props.open)
const innerSeeds = ref<BagSeedItem[]>([...props.seeds])

watch(() => props.open, (val) => {
  innerOpen.value = val
})

watch(innerOpen, (val) => {
  emit('update:open', val)
})

watch(
  () => props.seeds,
  (list) => {
    innerSeeds.value = [...list]
  },
  { deep: true }
)

function moveSeedUp(index: number) {
  if (index <= 0)
    return
  const list = innerSeeds.value
  const tmp = list[index]
  list[index] = list[index - 1]
  list[index - 1] = tmp
}

function moveSeedDown(index: number) {
  const list = innerSeeds.value
  if (index >= list.length - 1)
    return
  const tmp = list[index]
  list[index] = list[index + 1]
  list[index + 1] = tmp
}

function handleOk() {
  emit('update:seeds', [...innerSeeds.value])
  innerOpen.value = false
}

function handleCancel() {
  innerOpen.value = false
}
</script>

<template>
  <a-modal
    v-model:open="innerOpen"
    title="背包种子优先级"
    :width="480"
    ok-text="确认"
    cancel-text="取消"
    centered
    @ok="handleOk"
    @cancel="handleCancel"
  >
    <div class="mb-2 flex gap-2 items-center">
      <a-button color="cyan" size="small" variant="filled" @click="emit('refresh')">
        刷新
      </a-button>
      <a-button color="default" size="small" variant="filled" @click="emit('reset')">
        重置排序
      </a-button>
    </div>
    <a-spin :spinning="loading">
      <div v-if="!innerSeeds.length" class="a-color-text-tertiary text-xs">
        背包中暂无种子
      </div>
      <VueDraggable
        v-else
        v-model="innerSeeds"
        class="pr-1 flex flex-col gap-2 max-h-90 overflow-auto"
        :animation="150"
        handle=".i-carbon-draggable"
      >
        <div
          v-for="(seed, index) in innerSeeds"
          :key="seed.seedId"
          class="p-2 flex gap-3 items-center a-bg-layout a-border-border-sec border rounded-lg"
        >
          <div class="flex gap-1 cursor-grab items-center a-color-text-tertiary">
            <div class="i-carbon-draggable text-base" />
            <span class="font-medium text-center w-5 text-sm">{{ index + 1 }}</span>
          </div>
          <img
            v-if="seed.image"
            :src="seed.image"
            :alt="seed.name"
            class="h-10 w-10 object-contain"
          >
          <div class="flex flex-1 flex-col gap-1 min-w-0">
            <span class="font-medium truncate a-color-text text-sm">{{ seed.name }}</span>
            <div class="flex gap-1 items-center">
              <a-tag size="small" color="geekblue" variant="outlined" class="leading-none px-1! py-0.5!">
                x {{ seed.count ?? 0 }}
              </a-tag>
              <a-tag size="small" color="cyan" variant="outlined" class="leading-none px-1! py-0.5!">
                {{ (seed.requiredLevel ?? 0) >= 200 ? '活动种子' : `Lv.${seed.requiredLevel ?? 0}` }}
              </a-tag>
              <a-tag v-if="(seed.plantSize ?? 1) > 1" size="small" color="purple" variant="outlined" class="leading-none px-1! py-0.5!">
                {{ seed.plantSize ?? 1 }}x{{ seed.plantSize ?? 1 }}
              </a-tag>
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <a-button
              type="text"
              size="small"
              :disabled="index === 0"
              @click.stop="moveSeedUp(index)"
            >
              <div class="i-carbon-chevron-up" />
            </a-button>
            <a-button
              type="text"
              size="small"
              :disabled="index === innerSeeds.length - 1"
              @click.stop="moveSeedDown(index)"
            >
              <div class="i-carbon-chevron-down" />
            </a-button>
          </div>
        </div>
      </VueDraggable>
      <div class="mt-2 space-y-1 a-color-text-tertiary text-xs">
        <p>· 拖拽或使用上下箭头调整背包种子种植优先级</p>
        <p>· 空地不足时会等待，不会跳过当前高优先级种子</p>
      </div>
    </a-spin>
  </a-modal>
</template>
