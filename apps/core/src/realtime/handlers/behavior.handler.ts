import { Injectable } from '@nestjs/common'
import { BehaviorConfigService } from '@/behavior/behavior-config.service'
import { BehaviorInspectService } from '@/behavior/behavior-inspect.service'
import { WsAccount } from '../decorators/ws-account.decorator'
import { WsBody } from '../decorators/ws-body.decorator'
import { WsRoute } from '../decorators/ws-route.decorator'

@Injectable()
export class BehaviorHandler {
  constructor(
    private readonly behaviorConfig: BehaviorConfigService,
    private readonly behaviorInspect: BehaviorInspectService
  ) {}

  @WsRoute('behavior.query')
  query(@WsAccount() accountId: string) {
    return this.behaviorConfig.getConfig(accountId)
  }

  @WsRoute('behavior.inspect')
  inspect(@WsAccount() accountId: string) {
    return this.behaviorInspect.inspect(accountId)
  }

  @WsRoute('behavior.update')
  update(
    @WsAccount() accountId: string,
    @WsBody() data: Record<string, unknown>
  ) {
    return this.behaviorConfig.setConfig(accountId, data || {})
  }
}
