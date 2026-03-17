import type { RequestIntent } from '../../common/request-intent/request-intent-context.service'
import { SetMetadata } from '@nestjs/common'

export const WS_REQUEST_INTENT_KEY = Symbol('WS_REQUEST_INTENT')

export function WsRequestIntent(intent: RequestIntent): MethodDecorator {
  return SetMetadata(WS_REQUEST_INTENT_KEY, intent)
}

export function InteractiveAction(): MethodDecorator {
  return WsRequestIntent('interactive')
}

export function AutomationAction(): MethodDecorator {
  return WsRequestIntent('automation')
}

export function ScriptAction(): MethodDecorator {
  return WsRequestIntent('script')
}

export function SystemAction(): MethodDecorator {
  return WsRequestIntent('system')
}
