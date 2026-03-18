import type { AccountPushEventPayload } from '@/modules/account/domain/account.events'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { ACCOUNT_PUSH_EVENT } from '@/modules/account/domain/account.events'
import { WsPushService } from './ws-push.service'

@Injectable()
export class AccountPushBridge {
  constructor(private readonly push: WsPushService) {}

  @OnEvent(ACCOUNT_PUSH_EVENT)
  handlePush(payload: AccountPushEventPayload) {
    if (!payload?.route)
      return

    if (payload.target === 'broadcast') {
      this.push.broadcast(payload.route, payload.data)
      return
    }

    if (payload.target === 'event' && payload.accountId)
      this.push.emitToEvent(payload.accountId, payload.route, payload.data)
  }
}
