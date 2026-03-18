import type { IGameTransport, RequestEnvelope, RequestExecutionResult, RequestSource } from '../interfaces/game-transport.interface'
import type { GameOperationKey, GameOperationSpec } from './operation-catalog'
import { resolveRequestSource } from '../interfaces/request-context.interface'
import { GAME_OPERATION_CATALOG } from './operation-catalog'

export interface GameRpcCallOptions {
  invokeTimeoutMs?: number
  batchKey?: string
  allowInQuietHours?: boolean
  source?: RequestSource
}

export class GameRpcExecutor {
  constructor(private readonly client: IGameTransport) {}

  call<T = unknown>(
    operation: GameOperationKey,
    params: Record<string, unknown>,
    options: GameRpcCallOptions = {}
  ): Promise<RequestExecutionResult<T>> {
    const spec: GameOperationSpec = GAME_OPERATION_CATALOG[operation]
    const envelope: RequestEnvelope = {
      service: spec.service,
      method: spec.method,
      params,
      invokeTimeoutMs: options.invokeTimeoutMs,
      policy: {
        category: spec.category,
        source: options.source ?? resolveRequestSource(),
        batchKey: options.batchKey ?? spec.batchKey,
        allowInQuietHours: options.allowInQuietHours ?? spec.allowInQuietHours ?? false
      }
    }
    return this.client.invokeWithPolicy<T>(envelope)
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
