<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { warehouseApi } from '@/api'
import EmptyState from '@/components/EmptyState.vue'
import { useAccountRefresh } from '@/composables/useAccountRefresh'
import { useImageFallback } from '@/composables/useImageFallback'
import { useWsTopics } from '@/composables/useWsTopics'
import { useAccountStore, useBagStore } from '@/stores'
import message from '@/utils/message'
import ItemCard from './components/ItemCard.vue'
import SellModal from './components/SellModal.vue'

const accountStore = useAccountStore()
const bagStore = useBagStore()
const { items: bagItems } = storeToRefs(bagStore)
const { currentAccountId } = storeToRefs(accountStore)
const { onImageError, hasImageError } = useImageFallback()

const activeTab = ref('all')
const sellConfirmVisible = ref(false)
const sellTarget = ref<{ id: number, name: string, count: number, image?: string, price?: number, category?: string } | null>(null)
const selling = ref(false)

const CATEGORY_TABS = [
  { key: 'all', label: '全部', icon: 'i-twemoji-card-file-box' },
  { key: 'fruit', label: '果实', icon: 'i-twemoji-red-apple' },
  { key: 'seed', label: '种子', icon: 'i-twemoji-seedling' },
  { key: 'item', label: '道具', icon: 'i-twemoji-wrench' }
] as const

const filteredItems = computed(() => {
  const list = bagItems.value || []
  if (activeTab.value === 'all')
    return list
  return list.filter((it: { category?: string }) => (it.category || 'item') === activeTab.value)
})

function openSellConfirm(item: { id: number, name: string, count: number, image?: string, price?: number, category?: string }): void {
  if ((item.price ?? 0) <= 0 || !item.id || !(item.count > 0))
    return
  sellTarget.value = {
    id: Number(item.id),
    name: item.name || `物品${item.id}`,
    count: Number(item.count) || 1,
    image: item.image,
    price: item.price,
    category: item.category
  }
  sellConfirmVisible.value = true
}

async function confirmSell(sellCount: number): Promise<void> {
  const target = sellTarget.value
  if (!target || selling.value || sellCount < 1 || sellCount > target.count)
    return
  selling.value = true
  try {
    await warehouseApi.sell(target.id, sellCount)
    sellConfirmVisible.value = false
    const gold = (target.price ?? 0) * sellCount
    sellTarget.value = null
    message.success(gold > 0 ? `已售卖 ${target.name} x${sellCount}，获得 ${gold} 金币` : `已售卖 ${target.name} x${sellCount}`)
  } catch (e: unknown) {
    const err = e as { message?: string }
    message.error(err?.message || '售卖失败')
  } finally {
    selling.value = false
  }
}

function refresh(): void {
  const firstAcc = accountStore.accounts[0]
  if (!currentAccountId?.value && firstAcc)
    accountStore.selectAccount(String(firstAcc.uin))
}

useWsTopics(['bag'])
useAccountRefresh(refresh)
</script>

<template>
  <div class="flex flex-col gap-3 h-full">
    <div class="font-bold flex gap-2 items-center a-color-text">
      <div class="i-twemoji-sheaf-of-rice text-lg" aria-hidden="true" />
      我的仓库
    </div>

    <a-card
      variant="borderless"
      class="flex-1 overflow-hidden"
      :classes="{ body: '!p-0 !h-full !flex !flex-col' }"
    >
      <div class="p-4 flex flex-1 flex-col min-h-0 overflow-hidden">
        <div class="mb-3 flex flex-wrap gap-1">
          <button
            v-for="t in CATEGORY_TABS"
            :key="t.key"
            type="button"
            class="px-3 py-1.5 flex gap-1.5 cursor-pointer transition-colors duration-200 items-center text-sm rounded-lg"
            :class="activeTab === t.key ? 'a-bg-primary-bg a-color-primary font-medium' : 'a-bg-layout a-color-text-secondary hover:a-bg-layout/80'"
            @click="activeTab = t.key"
          >
            <div :class="t.icon" class="shrink-0 text-sm" aria-hidden="true" />
            {{ t.label }}
          </button>
        </div>

        <div class="flex flex-1 flex-col min-h-0 overflow-y-auto">
          <div v-if="!filteredItems.length" class="flex flex-1 min-h-[12rem] items-center justify-center">
            <EmptyState icon="i-twemoji-sheaf-of-rice text-3xl" description="仓库暂无物品，收获的作物会出现在这里" />
          </div>
          <div v-else class="gap-2 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
            <ItemCard
              v-for="item in filteredItems"
              :key="item.id"
              :item="item"
              :selling="selling"
              :image-error="hasImageError(item.id)"
              @sell="openSellConfirm(item)"
              @image-error="() => onImageError(item.id)"
            />
          </div>
        </div>
      </div>
    </a-card>

    <SellModal
      :open="sellConfirmVisible"
      :item="sellTarget"
      :loading="selling"
      :image-error="sellTarget ? hasImageError(sellTarget.id) : false"
      @confirm="confirmSell"
      @cancel="sellConfirmVisible = false"
      @image-error="() => sellTarget && onImageError(sellTarget.id)"
    />
  </div>
</template>
