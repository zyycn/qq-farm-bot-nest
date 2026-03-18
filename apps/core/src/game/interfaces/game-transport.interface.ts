export type { UserState } from '@qq-farm/shared'

export type RequestCategory
  = | 'farm_read'
    | 'farm_write'
    | 'farm_cycle'
    | 'friend_visit'
    | 'friend_write'
    | 'warehouse_read'
    | 'warehouse_write'
    | 'task_claim'
    | 'task_followup'
    | 'daily_reward'
    | 'daily_reward_followup'
    | 'session_bootstrap'
    | 'background'
    | 'heartbeat'
    | 'activity_report'
    | 'generic'

export type RequestSource = 'business' | 'bootstrap' | 'background' | 'system' | 'interactive'
export type RequestQueue = 'system' | 'interactive' | 'automation' | 'script'

export interface RequestPolicy {
  category: RequestCategory
  source: RequestSource
  batchKey?: string
  immediate?: boolean
  allowInQuietHours?: boolean
}

export interface RequestEnvelope {
  service: string
  method: string
  params: Record<string, unknown>
  policy?: Partial<RequestPolicy>
  queue?: RequestQueue
  queueWaitTimeoutMs?: number
  invokeTimeoutMs?: number
  maxQueueDelayMs?: number
  dropIfQueueBusy?: boolean
}

export interface RequestExecutionResult<T = unknown> {
  data: T
  meta?: any
}

export interface IGameTransport {
  readonly userState: import('@qq-farm/shared').UserState
  invoke: <T = unknown>(
    serviceName: string,
    methodName: string,
    params: Record<string, unknown>,
    timeout?: number
  ) => Promise<{ data: T, meta?: any }>
  invokeWithPolicy: <T = unknown>(envelope: RequestEnvelope) => Promise<RequestExecutionResult<T>>
  isConnected: () => boolean
  on: (event: string, listener: (...args: any[]) => void) => any
  removeListener: (event: string, listener: (...args: any[]) => void) => any
  emit: (event: string, ...args: any[]) => boolean
}
