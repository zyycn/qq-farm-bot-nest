import type { RequestSource } from '../../transport/interfaces/game-transport.interface'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Injectable } from '@nestjs/common'

export type RequestIntent = 'interactive' | 'automation' | 'script' | 'system'

export interface RequestIntentContext {
  intent?: RequestIntent
  route?: string
  requestId?: string
  accountId?: string
}

@Injectable()
export class RequestIntentContextService {
  private static readonly storage = new AsyncLocalStorage<RequestIntentContext>()

  run<T>(context: RequestIntentContext, callback: () => T): T {
    return RequestIntentContextService.storage.run(context, callback)
  }

  get(): RequestIntentContext | undefined {
    return RequestIntentContextService.storage.getStore()
  }

  static getCurrent(): RequestIntentContext | undefined {
    return RequestIntentContextService.storage.getStore()
  }
}

export function mapIntentToRequestSource(intent?: RequestIntent): RequestSource | undefined {
  switch (intent) {
    case 'interactive':
      return 'interactive'
    case 'script':
      return 'background'
    case 'system':
      return 'system'
    case 'automation':
      return 'business'
    default:
      return undefined
  }
}
