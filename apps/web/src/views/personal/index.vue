<script setup lang="ts">
import type { FarmOpType } from './constants'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import { useAccountRefresh } from '@/composables/useAccountRefresh'
import { useLandsWithCountdown } from '@/composables/useLandsWithCountdown'
import { useWs } from '@/composables/useWs'
import { useAccountStore, useBagStore, useFarmStore, useStatusStore } from '@/stores'
import message from '@/utils/message'
import BagPanel from './components/BagPanel.vue'
import DailyGiftPanel from './components/DailyGiftPanel.vue'
import FarmPanel from './components/FarmPanel.vue'
import GrowthTaskPanel from './components/GrowthTaskPanel.vue'
import { FARM_OP_CONFIRM_MESSAGES, FARM_OP_LABELS } from './constants'

const farmStore = useFarmStore()
const accountStore = useAccountStore()
const statusStore = useStatusStore()
const bagStore = useBagStore()

const { lands, summary } = storeToRefs(farmStore)
const { currentAccountId } = storeToRefs(accountStore)
const { status, dailyGifts } = storeToRefs(statusStore)
const { items: bagItems } = storeToRefs(bagStore)

const operating = ref(false)
const confirmVisible = ref(false)
const confirmConfig = ref({ title: '', message: '', opType: '' })

const connected = computed(() => status.value?.connection?.connected)
const growth = computed(() => dailyGifts.value?.growth || null)
const gifts = computed(() => dailyGifts.value?.gifts || [])

async function executeOperate() {
  if (!currentAccountId.value || !confirmConfig.value.opType)
    return
  confirmVisible.value = false
  operating.value = true
  try {
    const opType = confirmConfig.value.opType as FarmOpType
    await farmStore.operate(currentAccountId.value, opType)
    message.success(`已提交${FARM_OP_LABELS[opType] || '农场'}操作`)
  } catch (e: unknown) {
    const error = e as { message?: string }
    const opType = confirmConfig.value.opType as FarmOpType
    const opLabel = FARM_OP_LABELS[opType] || '农场'
    message.error(`${opLabel}操作失败：${error?.message || '未知错误'}`)
  } finally {
    operating.value = false
  }
}

function handleOperate(opType: string) {
  if (!currentAccountId.value)
    return
  const t = opType as FarmOpType
  confirmConfig.value = { title: '确认操作', message: FARM_OP_CONFIRM_MESSAGES[t] || '确定执行此操作吗？', opType }
  confirmVisible.value = true
}

async function initPageData() {
  const firstAcc = accountStore.accounts[0]
  if (!currentAccountId.value && firstAcc)
    accountStore.selectAccount(String(firstAcc.uin))
}

const landsWithCountdown = useLandsWithCountdown(lands)

useWs()
  .sub('lands')
  .sub('bag')
  .sub('dailyGifts')
  .on('lands.update', farmStore.setLandsFromRealtime)
  .on('bag.update', bagStore.setBagFromRealtime)
  .on('dailyGifts.update', statusStore.applyDailyGifts)

useAccountRefresh(initPageData)
</script>

<template>
  <div class="flex flex-col gap-3 md:h-full">
    <div class="flex flex-wrap gap-2 items-center justify-between">
      <div class="font-bold flex gap-2 items-center a-color-text">
        <div class="i-streamline-emojis-seedling text-lg" />
        <span class="text-lg">我的农场</span>
      </div>
    </div>

    <div class="flex flex-col gap-3 md:flex-1 md:flex-row md:overflow-hidden">
      <FarmPanel
        :lands="landsWithCountdown || []"
        :summary="summary"
        :connected="!!connected"
        :operating="operating"
        :current-account-id="currentAccountId ?? undefined"
        @operate="handleOperate"
      />

      <div class="shrink-0 flex-col gap-3 w-72 hidden overflow-hidden md:flex xl:w-80">
        <DailyGiftPanel :gifts="gifts" />
        <GrowthTaskPanel :growth="growth" />
        <BagPanel :key="currentAccountId" :items="bagItems" />
      </div>
    </div>

    <div class="flex flex-col gap-3 md:hidden">
      <DailyGiftPanel :gifts="gifts" />
      <GrowthTaskPanel :growth="growth" />
      <BagPanel :key="currentAccountId" :items="bagItems" />
    </div>

    <ConfirmModal
      :show="confirmVisible"
      :title="confirmConfig.title"
      :message="confirmConfig.message"
      @confirm="executeOperate"
      @cancel="confirmVisible = false"
    />
  </div>
</template>
