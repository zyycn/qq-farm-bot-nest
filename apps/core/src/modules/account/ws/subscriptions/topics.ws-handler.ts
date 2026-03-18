import type { SocketWithMeta } from '@/infrastructure/ws/ws-router.service'
import { Injectable } from '@nestjs/common'
import { WsBody } from '@/infrastructure/ws/decorators/ws-body.decorator'
import { WsFireAndForget, WsRoute } from '@/infrastructure/ws/decorators/ws-route.decorator'
import { AccountTopicsService } from './account-topics.service'

@Injectable()
export class TopicsHandler {
  constructor(
    private readonly topicsService: AccountTopicsService
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
