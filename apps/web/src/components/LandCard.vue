<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  land: any
}>()

const land = computed(() => props.land)

const LAND_LEVEL_CLASS: Record<number, string> = {
  1: 'land-yellow',
  2: 'land-red',
  3: 'land-black',
  4: 'land-gold'
}

const RING_HARVESTABLE = 'ring-2 ring-yellow-5 ring-offset-1'
const RING_STEALABLE = 'ring-2 ring-purple-5 ring-offset-1'

function getLandStatusClass(land: any) {
  const status = land.status
  const level = Number(land.level) || 0

  if (status === 'locked')
    return 'opacity-60 border-dashed'

  const baseClass = LAND_LEVEL_CLASS[level] || ''

  if (status === 'dead')
    return `${baseClass} grayscale`
  if (status === 'harvestable')
    return `${baseClass} ${RING_HARVESTABLE}`
  if (status === 'stealable')
    return `${baseClass} ${RING_STEALABLE}`
  return baseClass
}

function formatTime(sec: number) {
  if (sec <= 0)
    return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${h > 0 ? `${h}:` : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function getSafeImageUrl(url: string) {
  if (!url)
    return ''
  if (url.startsWith('http://'))
    return url.replace('http://', 'https://')
  return url
}

function getLandTypeName(level: number) {
  const typeMap: Record<number, string> = { 0: '普通', 1: '黄土地', 2: '红土地', 3: '黑土地', 4: '金土地' }
  return typeMap[Number(level) || 0] || ''
}
</script>

<template>
  <a-card
    size="small"
    :classes="{ body: '!p-1.5 !flex !flex-col !items-center !min-h-[130px] relative' }"
    :class="getLandStatusClass(land)"
  >
    <div class="p-1.5 flex gap-1.5 right-0 top-0 absolute">
      <i v-if="land.needWater" class="i-twemoji-droplet" title="需浇水" />
      <i v-if="land.needWeed" class="i-twemoji-herb" title="需除草" />
      <i v-if="land.needBug" class="i-twemoji-bug" title="需除虫" />
      <i v-if="land.status === 'harvestable'" class="i-twemoji-pinching-hand" title="可偷取" />
    </div>

    <span class="font-mono self-start a-color-text-tertiary text-xs">#{{ land.id }}</span>

    <div class="my-1 flex h-10 w-10 items-center justify-center">
      <img
        v-if="land.seedImage"
        :src="getSafeImageUrl(land.seedImage)"
        class="mb-0.5 max-h-full max-w-full object-contain"
        loading="lazy"
        referrerpolicy="no-referrer"
      >
      <div v-else class="i-twemoji-seedling a-color-text-quat text-xl" />
    </div>

    <div class="font-bold px-1 text-center w-full truncate text-sm" :title="land.plantName">
      {{ land.plantName || '-' }}
    </div>

    <div class="mt-0.5 text-center w-full a-color-text-secondary text-xs">
      <span v-if="land.matureInSec > 0" class="a-color-warning">
        预计 {{ formatTime(land.matureInSec) }} 后成熟
      </span>
      <span v-else>
        {{ land.phaseName || (land.status === 'locked' ? '未解锁' : '未开垦') }}
      </span>
    </div>

    <div class="a-color-text-tertiary text-xs">
      {{ getLandTypeName(land.level) }}
    </div>
  </a-card>
</template>

<style scoped>
/* 土地等级：边框颜色与背景同色，仅提高透明度以略突出 */

/* 1 黄土地 - 偏柠檬黄、略冷 */
.land-yellow {
  background-color: rgb(254 252 232 / 72%);
  border-color: rgb(254 252 232 / 100%);
}

/* 2 红土地 */
.land-red {
  background-color: rgb(255 237 243 / 70%);
  border-color: rgb(255 237 243 / 100%);
}

/* 3 黑土地 */
.land-black {
  background-color: rgba(163 165 168 / 16%);
  border-color: rgb(163 165 168 / 20%);
}

/* 4 金土地 - 明亮金灿灿，略深一档 */
.land-gold {
  background-color: rgb(255 253 156 / 50%);
  border-color: rgb(255 253 156 / 100%);
}

/* ========== 暗色模式：边框与背景同色，更高透明度 ========== */
:root.dark .land-yellow {
  background-color: rgb(253 230 138 / 5%);
  border-color: rgb(252 211 77 / 15%);
}
:root.dark .land-red {
  background-color: rgb(251 113 133 / 10%);
  border-color: rgb(251 113 133 / 20%);
}
:root.dark .land-black {
  background-color: rgb(148 163 184 / 10%);
  border-color: rgb(148 163 184 / 20%);
}
:root.dark .land-gold {
  background-color: rgb(250 204 21 / 10%);
  border-color: rgb(250 204 21 / 20%);
}
</style>
