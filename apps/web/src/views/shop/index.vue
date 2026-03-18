<script setup lang="ts">
import type { SeedOption } from '@/api/modules/farm'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { shopApi } from '@/api'
import EmptyState from '@/components/EmptyState.vue'
import { useAccountRefresh } from '@/composables/useAccountRefresh'
import { useImageFallback } from '@/composables/useImageFallback'
import { useAccountStore, useFarmStore } from '@/stores'
import message from '@/utils/message'
import BuyModal from './components/BuyModal.vue'
import SeedCard from './components/SeedCard.vue'

const accountStore = useAccountStore()
const farmStore = useFarmStore()
const { seeds } = storeToRefs(farmStore)
const { currentAccountId } = storeToRefs(accountStore)
const { onImageError, hasImageError } = useImageFallback()

interface BuySeedPayload {
  seedId: number
  goodsId: number
  name: string
  price: number
  requiredLevel?: number
  image?: string
  locked: boolean
  soldOut: boolean
}

const searchQuery = ref('')
const buyModalVisible = ref(false)
const buyTarget = ref<BuySeedPayload | null>(null)
const buying = ref(false)

const filteredSeeds = computed(() => {
  const list = seeds.value ?? []
  const q = searchQuery.value.trim().toLowerCase()
  if (!q)
    return list
  return list.filter((s: { name?: string }) => (s.name ?? '').toLowerCase().includes(q))
})

function openBuyModal(seed: SeedOption): void {
  if (seed.locked || seed.soldOut || !seed.goodsId)
    return
  buyTarget.value = {
    seedId: seed.seedId,
    goodsId: seed.goodsId,
    name: seed.name,
    price: seed.price ?? 0,
    requiredLevel: seed.requiredLevel,
    image: seed.image,
    locked: !!seed.locked,
    soldOut: !!seed.soldOut
  }
  buyModalVisible.value = true
}

async function confirmBuy(count: number): Promise<void> {
  const target = buyTarget.value
  if (!target || buying.value)
    return
  buying.value = true
  try {
    await shopApi.buy(target.goodsId, count, target.price)
    buyModalVisible.value = false
    buyTarget.value = null
    message.success(`已购买 ${target.name} x${count}`)
  } catch (e: unknown) {
    const err = e as { message?: string }
    message.error(err?.message || '购买失败')
  } finally {
    buying.value = false
  }
}

function initPageData() {
  accountStore.selectAccount(currentAccountId.value)
  farmStore.querySeeds(currentAccountId.value)
}

useAccountRefresh(initPageData)
</script>

<template>
  <div class="flex flex-col gap-3 h-full">
    <div class="font-bold flex gap-2 items-center a-color-text">
      <div class="i-streamline-emojis-herb text-lg" />
      <span class="text-lg">种子商店</span>
    </div>

    <a-card
      variant="borderless"
      class="flex-1 overflow-hidden"
      :classes="{ body: '!p-0 !h-full !flex !flex-col' }"
    >
      <div class="p-4 flex flex-1 flex-col min-h-0 overflow-hidden">
        <div class="flex justify-end">
          <a-input
            v-model:value="searchQuery"
            placeholder="搜索种子名称…"
            allow-clear
            autocomplete="off"
            class="mb-3 w-60!"
          >
            <template #prefix>
              <span class="i-streamline-emojis-magnifying-glass-tilted-left a-color-text-tertiary text-base" />
            </template>
          </a-input>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto">
          <div v-if="!seeds?.length" class="flex h-full items-center justify-center">
            <EmptyState icon="i-streamline-emojis-seedling text-3xl" description="暂无种子数据，请先选择账号并连接" />
          </div>
          <div v-else-if="!filteredSeeds.length" class="flex h-full items-center justify-center">
            <EmptyState icon="i-streamline-emojis-magnifying-glass-tilted-left text-3xl" description="未找到匹配的种子" />
          </div>
          <div v-else class="gap-2 grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
            <SeedCard
              v-for="seed in filteredSeeds"
              :key="seed.seedId ?? seed.goodsId ?? seed.name"
              :seed="seed"
              :image-error="hasImageError(seed.seedId)"
              @select="openBuyModal(seed)"
              @image-error="() => onImageError(seed.seedId)"
            />
          </div>
        </div>
      </div>
    </a-card>

    <BuyModal
      :open="buyModalVisible"
      :seed="buyTarget"
      :loading="buying"
      :image-error="buyTarget ? hasImageError(buyTarget.seedId) : false"
      @confirm="confirmBuy"
      @cancel="buyModalVisible = false"
      @image-error="() => buyTarget && onImageError(buyTarget.seedId)"
    />
  </div>
</template>
