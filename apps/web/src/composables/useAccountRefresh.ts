import { storeToRefs } from 'pinia'
import { onMounted, watch } from 'vue'
import { useAccountStore } from '@/stores'

/**
 * 统一处理 onMounted + watch(currentAccountId) 的页面数据刷新模式。
 * 额外 watch currentAccount：F5 刷新时 currentAccountId 不变，但 currentAccount 在 accounts 到达后从 undefined 变为有值，需再次触发刷新。
 */
export function useAccountRefresh(fn: () => void | Promise<void>): void {
  const accountStore = useAccountStore()
  const { currentAccountId, currentAccount } = storeToRefs(accountStore)

  onMounted(fn)
  watch(currentAccountId, fn)
  watch(currentAccount, (val, old) => {
    if (val && !old)
      fn()
  })
}
