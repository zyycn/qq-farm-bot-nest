import { Injectable } from '@nestjs/common'
import { ActionPacerService } from './action-pacer.service'

@Injectable()
export class DelayService {
  constructor(private readonly pacer: ActionPacerService) {}

  wait(ms: number): Promise<void> {
    return this.pacer.wait(ms)
  }

  rapidFire(accountId: string, fallbackMs = 50): Promise<void> {
    return this.pacer.rapidFire(accountId, fallbackMs)
  }

  afterResponse(accountId: string, fallbackMs = 100): Promise<void> {
    return this.pacer.afterResponse(accountId, fallbackMs)
  }

  action(accountId: string, fallbackMs = 200): Promise<void> {
    return this.pacer.action(accountId, fallbackMs)
  }

  batch(accountId: string, index: number, total: number, fallbackMs = 200): Promise<void> {
    return this.pacer.batch(accountId, index, total, fallbackMs)
  }

  taskSwitch(accountId: string, fallbackMs = 500): Promise<void> {
    return this.pacer.taskSwitch(accountId, fallbackMs)
  }

  friendSwitch(accountId: string, fallbackMs = 200): Promise<void> {
    return this.pacer.friendSwitch(accountId, fallbackMs)
  }
}
