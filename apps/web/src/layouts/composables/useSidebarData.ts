import { useDateFormat, useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ws } from '@/api'
import routes from '@/router/routes'
import { useAccountStore, useAppStore, useStatusStore, useUserStore } from '@/stores'

export function useSidebarData() {
  const accountStore = useAccountStore()
  const statusStore = useStatusStore()
  const appStore = useAppStore()
  const route = useRoute()
  const router = useRouter()
  const { accounts, currentAccount, currentAccountId } = storeToRefs(accountStore)
  const { status } = storeToRefs(statusStore)
  const { sidebarCollapsed, sidebarOpen } = storeToRefs(appStore)

  // Modals
  const showAccountModal = ref(false)
  const showRemarkModal = ref(false)
  const accountToEdit = ref<any>(null)

  // Connection
  const wsErrorNotifiedAt = ref<Record<string, number>>({})
  const now = useNow()
  const formattedTime = useDateFormat(now, 'YYYY-MM-DD HH:mm:ss')

  function handleAccountSaved() {
    showAccountModal.value = false
    showRemarkModal.value = false
  }

  // Lifecycle
  onBeforeUnmount(() => {
    ws.disconnect()
  })

  // Watch account changes（F5 时 currentAccount 可能尚未就绪，用持久化的 currentAccountId 发起连接）
  watch(
    () => currentAccount.value?.uin ?? currentAccountId.value ?? '',
    (newUin) => {
      const token = useUserStore().adminToken
      if (!token)
        return
      const toConnect = String(newUin || 'all')
      if (ws.currentAccountId.value && ws.currentAccountId.value !== toConnect)
        statusStore.resetState()
      ws.connect(token, toConnect)
    },
    { immediate: true }
  )

  // WS error watch
  watch(
    () => status.value?.wsError,
    (wsError: any) => {
      if (!wsError || Number(wsError.code) !== 400 || !currentAccount.value)
        return

      const errAt = Number(wsError.at) || 0
      const accId = String(currentAccount.value.uin || '')
      const lastNotified = wsErrorNotifiedAt.value[accId] || 0
      if (errAt <= lastNotified)
        return

      wsErrorNotifiedAt.value[accId] = errAt
      accountToEdit.value = currentAccount.value
      showAccountModal.value = true
    },
    { deep: true }
  )

  // Auto-close sidebar on mobile route change
  watch(
    () => route.path,
    () => {
      if (window.innerWidth < 1024)
        appStore.closeSidebar()
    }
  )

  // Computed（uptime / serverVersion 来自 ws subscribed 事件，连接断开即视为 ping 失败）
  const uptime = computed(() => {
    const base = ws.serverUptime.value
    const receivedAt = ws.uptimeReceivedAt.value
    const diff = receivedAt
      ? Math.floor(base + (now.value.getTime() - receivedAt) / 1000)
      : 0
    const h = Math.floor(diff / 3600)
    const m = Math.floor((diff % 3600) / 60)
    const s = diff % 60
    return `${h}h ${m}m ${s}s`
  })

  const displayInfo = computed<{ primary: string, secondary: string }>(() => {
    const acc = currentAccount.value

    if (!acc) {
      return { primary: '选择账号', secondary: '' }
    }

    return {
      primary: acc?.nick || '',
      secondary: acc?.name || ''
    }
  })

  const selectedAccountId = computed({
    get: () => String(currentAccount.value?.uin ?? ''),
    set: (val: any) => {
      if (!val)
        return
      accountStore.selectAccount(String(val))
    }
  })

  const accountOptions = computed(() => {
    return (accounts.value || []).map((acc: any) => ({
      ...acc,
      label: acc.name || acc.nick || acc.uin,
      value: String(acc.uin)
    }))
  })

  const connectionStatus = computed<{ text: string, badge: 'error' | 'default' | 'processing' }>(() => {
    if (!ws.connected.value)
      return { text: '系统离线', badge: 'error' }
    if (!currentAccount.value?.uin)
      return { text: '请添加账号', badge: 'default' }
    if (status.value?.connection?.connected)
      return { text: '运行中', badge: 'processing' }
    return { text: '未连接', badge: 'default' }
  })

  // Menu
  const layoutRoute = routes.find(r => r.path === '/')
  const menuItems = computed<{ key: string, icon: string, label: string }[]>(() => {
    const children = layoutRoute?.children ?? []
    return children
      .filter(r => r.meta?.label)
      .map((r) => {
        const path = r.path ? `/${r.path}` : '/'
        return {
          key: path,
          icon: r.meta?.icon as string,
          label: r.meta!.label as string
        }
      })
  })

  function onMenuClick(path: string) {
    router.push(path)
  }

  function isActive(path: string): boolean {
    return route.path === path
  }

  function openRemarkForCurrent() {
    if (!currentAccount.value)
      return
    accountToEdit.value = currentAccount.value
    showRemarkModal.value = true
  }

  const version = __APP_VERSION__

  return {
    // Stores refs
    currentAccount,
    sidebarCollapsed,
    sidebarOpen,

    // Modals
    showAccountModal,
    showRemarkModal,
    accountToEdit,
    handleAccountSaved,
    openRemarkForCurrent,

    // Connection（serverVersion 来自 ws.subscribed）
    serverVersion: ws.serverVersion,
    uptime,
    formattedTime,
    connectionStatus,

    // Account
    displayInfo,
    selectedAccountId,
    accountOptions,

    // Menu
    menuItems,
    onMenuClick,
    isActive,

    // App
    version,
    appStore
  }
}
