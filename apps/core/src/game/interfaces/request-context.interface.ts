import type { RequestSource } from '../../transport/interfaces/game-transport.interface'

export interface GameRequestContext {
  requestSource?: RequestSource
}

export function resolveRequestSource(context?: GameRequestContext): RequestSource {
  return context?.requestSource ?? 'business'
}

export function isInteractiveRequest(context?: GameRequestContext): boolean {
  return context?.requestSource === 'interactive'
}
