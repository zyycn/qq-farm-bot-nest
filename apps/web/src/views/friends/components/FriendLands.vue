<script setup lang="ts">
import type { FarmLand } from '@/api/types'
import EmptyState from '@/components/EmptyState.vue'
import LandCard from '@/components/LandCard.vue'

defineProps<{
  lands: FarmLand[]
  loading: boolean
}>()
</script>

<template>
  <div class="px-4 py-3 border-t border-t-solid a-bg-layout a-border-t-border-sec">
    <a-spin v-if="loading" class="py-4 !block" />
    <EmptyState v-else-if="!lands || lands.length === 0" icon="i-streamline-emojis-seedling text-3xl" description="无土地数据" />
    <div v-else class="gap-2 grid grid-cols-2 lg:grid-cols-8 md:grid-cols-5 sm:grid-cols-4">
      <LandCard v-for="land in lands" :key="land.id" :land="land" />
    </div>
  </div>
</template>
