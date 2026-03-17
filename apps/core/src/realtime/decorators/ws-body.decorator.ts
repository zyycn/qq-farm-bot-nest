export type WsParamType = 'body' | 'account'

export interface WsParamMetadata {
  index: number
  type: WsParamType
}

export const WS_PARAMS_KEY = Symbol('WS_PARAMS')

export function WsBody(): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    const existing: WsParamMetadata[]
      = Reflect.getMetadata(WS_PARAMS_KEY, target, propertyKey as string | symbol) ?? []

    existing.push({ index: parameterIndex, type: 'body' })
    Reflect.defineMetadata(WS_PARAMS_KEY, existing, target, propertyKey as string | symbol)
  }
}
