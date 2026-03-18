import { Injectable } from '@nestjs/common'
import { AccountStatusService } from '@/account/account-status.service'
import { GlobalConfigService } from '@/store/global-config.service'
import { WsBody } from '../decorators/ws-body.decorator'
import { WsRoute } from '../decorators/ws-route.decorator'

@Injectable()
export class PanelHandler {
  constructor(
    private readonly globalConfig: GlobalConfigService,
    private readonly status: AccountStatusService
  ) {}

  @WsRoute('panel.query')
  query(): unknown {
    return {
      ui: this.globalConfig.getUI(),
      offlineReminder: this.globalConfig.getOfflineReminder(),
      remoteLoginKey: this.globalConfig.getRemoteLoginKey(),
      defaultDeviceProfileId: this.globalConfig.getDefaultDeviceProfileId()
    }
  }

  @WsRoute('panel.updateTheme')
  theme(@WsBody() data: Record<string, unknown>): unknown {
    const result = this.globalConfig.setUITheme(data?.theme as string)
    this.status.notifyPanelUpdate()
    return result
  }

  @WsRoute('panel.updateOfflineReminder')
  offlineReminder(@WsBody() data: Record<string, unknown>): unknown {
    const result = this.globalConfig.setOfflineReminder(data || {})
    this.status.notifyPanelUpdate()
    return result
  }

  @WsRoute('panel.updateRemoteLoginKey')
  remoteLoginKey(@WsBody() data: Record<string, unknown>): unknown {
    const result = this.globalConfig.setRemoteLoginKey(String(data?.key ?? ''))
    this.status.notifyPanelUpdate()
    return { remoteLoginKey: result }
  }
}
