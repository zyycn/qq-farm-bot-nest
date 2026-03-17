export type { UserState } from '@qq-farm/shared'

export interface IGameTransport {
  readonly userState: import('@qq-farm/shared').UserState
  invoke: <T = unknown>(
    serviceName: string,
    methodName: string,
    params: Record<string, unknown>,
    timeout?: number
  ) => Promise<{ data: T, meta?: any }>
  isConnected: () => boolean
  on: (event: string, listener: (...args: any[]) => void) => any
  removeListener: (event: string, listener: (...args: any[]) => void) => any
  emit: (event: string, ...args: any[]) => boolean
}
