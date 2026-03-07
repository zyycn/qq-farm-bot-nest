import { onBeforeUnmount, onMounted } from 'vue'
import { ws } from '@/api'

/**
 * 按页面订阅 WS topic，进入页面时订阅指定 topics，离开时清空订阅
 */
export function useWsTopics(topics: string[]) {
  onMounted(() => ws.subscribeTopics(topics))
  onBeforeUnmount(() => ws.subscribeTopics([]))
}
