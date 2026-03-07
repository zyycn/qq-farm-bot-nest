import { storeToRefs } from 'pinia'
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { ws } from '@/api'
import { useAccountStore } from '@/stores'

export function useWsTopics(topics: string[]): void {
  const accountStore = useAccountStore()
  const { currentAccountId } = storeToRefs(accountStore)

  function doSubscribe(tops: string[]) {
    ws.subscribe(currentAccountId.value, tops)
  }

  onMounted(() => doSubscribe(topics))
  watch(currentAccountId, () => doSubscribe(topics))
  onBeforeUnmount(() => doSubscribe([]))
}
