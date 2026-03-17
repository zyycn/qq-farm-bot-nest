import type { WsParamMetadata } from './ws-body.decorator'
import { WS_PARAMS_KEY } from './ws-body.decorator'

export function WsAccount(): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    const existing: WsParamMetadata[]
      = Reflect.getMetadata(WS_PARAMS_KEY, target, propertyKey as string | symbol) ?? []

    existing.push({ index: parameterIndex, type: 'account' })
    Reflect.defineMetadata(WS_PARAMS_KEY, existing, target, propertyKey as string | symbol)
  }
}
