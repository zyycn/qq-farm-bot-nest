import type { RequestSource } from './game-transport.interface'
import { mapIntentToRequestSource, RequestIntentContextService } from '../../common/request-intent/request-intent-context.service'

export interface GameRequestContext {
  requestSource?: RequestSource
}

export function resolveRequestSource(context?: GameRequestContext): RequestSource {
  return context?.requestSource
    ?? mapIntentToRequestSource(RequestIntentContextService.getCurrent()?.intent)
    ?? 'business'
}

export function isInteractiveRequest(context?: GameRequestContext): boolean {
  return resolveRequestSource(context) === 'interactive'
}
