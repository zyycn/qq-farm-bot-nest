import type { StatusEventName } from './runner-types'
import type { AccountStatusEventPayload } from '@/modules/account/domain/account.events'
import type { GameLogEntry, StatusEventData } from '@/modules/game/domain/types'
import { EventEmitter2 } from '@nestjs/event-emitter'
import {
  ACCOUNT_KICKED_EVENT,
  ACCOUNT_LOG_EVENT,
  ACCOUNT_STATUS_EVENT,
  ACCOUNT_WS_ERROR_EVENT
} from '@/modules/account/domain/account.events'

/**
 * Encapsulates all EventEmitter2 interactions for an AccountRunner.
 * The runner delegates all event emission through this bridge,
 * keeping EE2 coupling in one place.
 */
export class RunnerEventBridge {
  constructor(
    private readonly accountId: string,
    private readonly eventEmitter: EventEmitter2
  ) {}

  emitKicked(reason: string) {
    this.eventEmitter.emit(ACCOUNT_KICKED_EVENT, {
      accountId: this.accountId,
      reason
    })
  }

  emitWsError(code: number, message: string) {
    this.eventEmitter.emit(ACCOUNT_WS_ERROR_EVENT, {
      accountId: this.accountId,
      code,
      message
    })
  }

  emitStatus(event: StatusEventName, data: StatusEventData, accountName: string) {
    const payload: AccountStatusEventPayload = {
      accountId: this.accountId,
      event,
      data,
      accountName
    }
    this.eventEmitter.emit(ACCOUNT_STATUS_EVENT, payload)
  }

  emitData(event: string, data: unknown) {
    this.eventEmitter.emit(event, {
      accountId: this.accountId,
      data
    })
  }

  emitLog(accountName: string, entry: GameLogEntry) {
    this.eventEmitter.emit(ACCOUNT_LOG_EVENT, {
      accountId: this.accountId,
      accountName,
      entry
    })
  }
}
