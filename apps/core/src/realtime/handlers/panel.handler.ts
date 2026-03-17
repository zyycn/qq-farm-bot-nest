import { Injectable } from '@nestjs/common'
import { AccountStatusService } from '@/account/account-status.service'
import { StoreService } from '@/store/store.service'
import { WsBody } from '../decorators/ws-body.decorator'
import { WsRoute } from '../decorators/ws-route.decorator'

@Injectable()
export class PanelHandler {
  constructor(
    private readonly store: StoreService,
    private readonly status: AccountStatusService
  ) {}

  @WsRoute('panel.query')
  query(): unknown {
    return {
      ui: this.store.getUI(),
      offlineReminder: this.store.getOfflineReminder(),
      remoteLoginKey: this.store.getRemoteLoginKey(),
      defaultDeviceProfileId: this.store.getDefaultDeviceProfileId()
    }
  }

  @WsRoute('panel.updateTheme')
  theme(@WsBody() data: Record<string, unknown>): unknown {
    const result = this.store.setUITheme(data?.theme as string)
    this.status.notifyPanelUpdate()
    return result
  }

  @WsRoute('panel.updateOfflineReminder')
  offlineReminder(@WsBody() data: Record<string, unknown>): unknown {
    const result = this.store.setOfflineReminder(data || {})
    this.status.notifyPanelUpdate()
    return result
  }

  @WsRoute('panel.updateRemoteLoginKey')
  remoteLoginKey(@WsBody() data: Record<string, unknown>): unknown {
    const result = this.store.setRemoteLoginKey(String(data?.key ?? ''))
    this.status.notifyPanelUpdate()
    return { remoteLoginKey: result }
  }
}
