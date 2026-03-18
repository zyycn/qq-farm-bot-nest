import type { RequestEnvelope, RequestExecutionResult } from './request-pacing.interface'

export type {
  RequestCategory,
  RequestEnvelope,
  RequestExecutionResult,
  RequestPolicy,
  RequestQueue,
  RequestSource
} from './request-pacing.interface'
export type { UserState } from '@qq-farm/shared'

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
