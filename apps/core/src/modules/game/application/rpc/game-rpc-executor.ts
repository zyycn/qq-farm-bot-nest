import type { GameOperationKey } from './operation-catalog'
import type { IGameTransport, RequestExecutionResult } from '@/modules/game/interfaces/game-transport.interface'
import { GAME_OPERATION_CATALOG } from './operation-catalog'

export interface GameRpcCallOptions {
  invokeTimeoutMs?: number
}

export class GameRpcExecutor {
  constructor(private readonly client: IGameTransport) {}

  call<T = unknown>(
    operation: GameOperationKey,
    params: Record<string, unknown>,
    options: GameRpcCallOptions = {}
  ): Promise<RequestExecutionResult<T>> {
    const spec = GAME_OPERATION_CATALOG[operation]
    return this.client.invoke<T>(spec.service, spec.method, params, options.invokeTimeoutMs)
  }

  async callFirstAvailable<T = unknown>(
    operations: readonly GameOperationKey[],
    params: Record<string, unknown>,
    options: GameRpcCallOptions = {}
  ): Promise<RequestExecutionResult<T>> {
    const errors: string[] = []
    for (const operation of operations) {
      try {
        return await this.call<T>(operation, params, options)
      } catch (error) {
        const spec = GAME_OPERATION_CATALOG[operation]
        const message = error instanceof Error ? error.message : String(error || 'unknown')
        errors.push(`${spec.service}.${spec.method}: ${message}`)
      }
    }
    throw new Error(errors.join(' | ') || '所有候选请求都调用失败')
  }
}
