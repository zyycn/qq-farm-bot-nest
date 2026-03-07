import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

export { type Account, useAccountStore } from './modules/account'
export { useAnalyticsStore } from './modules/analytics'
export { useAppStore } from './modules/app'
export { useBagStore } from './modules/bag'
export { type Land, useFarmStore } from './modules/farm'
export { useFriendStore } from './modules/friend'
export { type AutomationConfig, type FriendQuietHoursConfig, type IntervalsConfig, type SettingsState, type UIConfig, useSettingStore } from './modules/setting'
export { useStatusStore } from './modules/status'
export { useUserStore } from './modules/user'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

export default pinia
