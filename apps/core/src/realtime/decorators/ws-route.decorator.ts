import { applyDecorators, SetMetadata } from '@nestjs/common'

export const WS_ROUTE_KEY = Symbol('WS_ROUTE')
export const WS_FIRE_AND_FORGET_KEY = Symbol('WS_FIRE_AND_FORGET')

export function WsRoute(route: string): MethodDecorator {
  return SetMetadata(WS_ROUTE_KEY, route)
}

export function WsFireAndForget(): MethodDecorator {
  return applyDecorators(SetMetadata(WS_FIRE_AND_FORGET_KEY, true))
}
