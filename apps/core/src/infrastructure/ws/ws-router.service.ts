import type { Type } from '@nestjs/common'
import type { WsResponse } from '@qq-farm/shared'
import type { Socket } from 'socket.io'
import type { WsParamMetadata } from './decorators/ws-body.decorator'
import { Injectable } from '@nestjs/common'
import { MetadataScanner, Reflector } from '@nestjs/core'
import { createResponse } from '@qq-farm/shared'
import { WS_PARAMS_KEY } from './decorators/ws-body.decorator'
import { WS_FIRE_AND_FORGET_KEY, WS_ROUTE_KEY } from './decorators/ws-route.decorator'
import { requireAccountId } from './ws-guards'

export interface SocketWithMeta extends Socket {
  data: Socket['data'] & {
    accountId?: string
    topics?: Set<string>
    events?: Set<string>
  }
}

export const WS_CODE_SUCCESS = 0
export const WS_CODE_BAD_REQUEST = 400
export const WS_CODE_UNAUTHORIZED = 401
export const WS_CODE_FORBIDDEN = 403
export const WS_CODE_NOT_FOUND = 404
export const WS_CODE_INTERNAL = 500

interface RouteHandlerDef {
  instance: object
  methodName: string
  params: WsParamMetadata[]
  fireAndForget: boolean
}

@Injectable()
export class WsRouterService {
  private handlers = new Map<string, RouteHandlerDef>()

  constructor(
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector
  ) {}

  registerHandlers(instances: object[]): void {
    for (const instance of instances)
      this.registerHandler(instance)
  }

  registerHandler(instance: object): void {
    const proto = Object.getPrototypeOf(instance) as Type<unknown> | null
    if (!proto)
      return

    this.scanner.getAllMethodNames(proto).forEach((methodName) => {
      const descriptor = Object.getOwnPropertyDescriptor(proto, methodName)
      if (!descriptor || typeof descriptor.value !== 'function')
        return

      const route = this.reflector.get<string | undefined>(WS_ROUTE_KEY, descriptor.value)
      if (!route)
        return

      if (this.handlers.has(route))
        throw new Error(`重复注册 websocket 路由: ${route}`)

      const params: WsParamMetadata[]
        = Reflect.getMetadata(WS_PARAMS_KEY, proto, methodName) ?? []
      const fireAndForget: boolean
        = this.reflector.get<boolean>(WS_FIRE_AND_FORGET_KEY, descriptor.value) ?? false

      this.handlers.set(route, { instance, methodName, params, fireAndForget })
    })
  }

  async dispatch(
    id: string,
    route: string,
    client: SocketWithMeta,
    data: Record<string, unknown>
  ): Promise<WsResponse | null> {
    const def = this.handlers.get(route)
    if (!def)
      return createResponse(id, WS_CODE_NOT_FOUND, undefined, `未知路由: ${route}`)

    try {
      const { instance, methodName, params } = def
      const handler = (instance as Record<string, (...args: unknown[]) => unknown>)[methodName].bind(instance)

      const args: unknown[] = []
      args[0] = client

      for (const meta of params) {
        if (meta.type === 'body')
          args[meta.index] = data ?? {}
        else if (meta.type === 'account')
          args[meta.index] = requireAccountId(client)
      }

      const result = await handler(...args)
      if (def.fireAndForget)
        return null
      return createResponse(id, WS_CODE_SUCCESS, result ?? null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '操作失败'
      return createResponse(id, WS_CODE_INTERNAL, undefined, msg)
    }
  }
}
