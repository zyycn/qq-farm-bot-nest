import type { AccountPushEventPayload } from '../account/account.events'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { ACCOUNT_PUSH_EVENT } from '../account/account.events'
import { RealtimePushService } from './realtime-push.service'

@Injectable()
export class AccountPushBridge {
  constructor(private readonly push: RealtimePushService) {}

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
