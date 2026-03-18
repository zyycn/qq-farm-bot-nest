import type { SocketWithMeta } from '../ws-router.service'
import { Injectable } from '@nestjs/common'
import { WsBody } from '../decorators/ws-body.decorator'
import { WsFireAndForget, WsRoute } from '../decorators/ws-route.decorator'
import { WsTopicsService } from '../ws-topics.service'

@Injectable()
export class TopicsHandler {
  constructor(
    private readonly topicsService: WsTopicsService
  ) {}

  @WsRoute('topics.sub')
  subscribe(
    client: SocketWithMeta,
    @WsBody() data: Record<string, unknown>
  ): Promise<{ accountId: string }> {
    return this.topicsService.handleSubscribe(client, data)
  }

  @WsRoute('topics.unsub')
  @WsFireAndForget()
  unsubscribe(
    client: SocketWithMeta,
    @WsBody() data: Record<string, unknown>
  ): void {
    this.topicsService.handleUnsubscribe(client, data)
  }
}
