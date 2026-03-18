import type { Store } from 'pinia'
import type { OfflineReminderConfig, UIConfig } from '@/api/modules/panel'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

export { type Account, useAccountStore } from './modules/account'
export { useAnalyticsStore } from './modules/analytics'
export { useAppStore } from './modules/app'
export { useBagStore } from './modules/bag'
export { useDeviceStore } from './modules/device'
export { type Land, useFarmStore } from './modules/farm'
export { useFriendStore } from './modules/friend'
export { usePanelStore } from './modules/panel'
export { useStatusStore } from './modules/status'
export { type AutomationConfig, type FriendQuietHoursConfig, type IntervalsConfig, useStrategyStore } from './modules/strategy'
export { useUserStore } from './modules/user'

const pinia = createPinia()

// 持久化插件
pinia.use(piniaPluginPersistedstate)

// 每个挂在访问全部Store能力
const stores = new Set<Store>()
pinia.use(({ store }) => {
  stores.add(store)
  store.$all = stores
  store.$resetAll = () => store.$all.forEach(s => s.$reset())
})

// 重置全部
export function resetAllStores() {
  stores.forEach(s => s.$reset())
}

export type { OfflineReminderConfig, UIConfig }

export default pinia

declare module 'pinia' {
  export interface PiniaCustomProperties {
    $all: typeof stores
    $reset_all: () => void
  }
}
