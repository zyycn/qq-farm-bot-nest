import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { WsBody } from '@/infrastructure/ws/decorators/ws-body.decorator'
import { WsRoute } from '@/infrastructure/ws/decorators/ws-route.decorator'
import { ACCOUNT_DATA_PANEL_EVENT } from '@/modules/account/domain/account.events'
import { GlobalConfigService } from '@/modules/settings/application/global-config.service'

@Injectable()
export class PanelHandler {
  constructor(
    private readonly globalConfig: GlobalConfigService,
    private readonly eventEmitter: EventEmitter2
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
    this.emitPanelUpdate()
    return result
  }

  @WsRoute('panel.updateOfflineReminder')
  offlineReminder(@WsBody() data: Record<string, unknown>): unknown {
    const result = this.globalConfig.setOfflineReminder(data || {})
    this.emitPanelUpdate()
    return result
  }

  @WsRoute('panel.updateRemoteLoginKey')
  remoteLoginKey(@WsBody() data: Record<string, unknown>): unknown {
    const result = this.globalConfig.setRemoteLoginKey(String(data?.key ?? ''))
    this.emitPanelUpdate()
    return { remoteLoginKey: result }
  }

  private emitPanelUpdate() {
    this.eventEmitter.emit(ACCOUNT_DATA_PANEL_EVENT, {
      ui: this.globalConfig.getUI(),
      offlineReminder: this.globalConfig.getOfflineReminder(),
      remoteLoginKey: this.globalConfig.getRemoteLoginKey(),
      defaultDeviceProfileId: this.globalConfig.getDefaultDeviceProfileId()
    })
  }
}
