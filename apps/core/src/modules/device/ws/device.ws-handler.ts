import type { DeviceProfile } from '@qq-farm/shared'
import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { WsBody } from '@/infrastructure/ws/decorators/ws-body.decorator'
import { WsRoute } from '@/infrastructure/ws/decorators/ws-route.decorator'
import {
  ACCOUNT_DATA_PANEL_EVENT,
  ACCOUNT_RECONNECT_REQUEST_EVENT
} from '@/modules/account/domain/account.events'
import { DeviceProfileService } from '@/modules/device/application/device-profile.service'
import { GlobalConfigService } from '@/modules/settings/application/global-config.service'

interface DeviceProfilePayload {
  id?: string
  name?: string
  presetId?: string
  profile?: Partial<DeviceProfile>
}

interface DeviceProfileDeletePayload {
  id?: string
}

interface DeviceDefaultPayload {
  deviceProfileId?: string | null
}

@Injectable()
export class DeviceHandler {
  constructor(
    private readonly deviceProfile: DeviceProfileService,
    private readonly globalConfig: GlobalConfigService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  @WsRoute('device.presets')
  getPresets() {
    return this.deviceProfile.getPresets()
  }

  @WsRoute('device.list')
  list() {
    return this.deviceProfile.list()
  }

  @WsRoute('device.create')
  create(@WsBody() body: DeviceProfilePayload) {
    const id = body?.id || `dev_${Date.now()}`
    return this.deviceProfile.create({
      id,
      name: body?.name || 'Unnamed',
      presetId: body?.presetId,
      profile: body?.profile || {}
    })
  }

  @WsRoute('device.update')
  update(@WsBody() body: DeviceProfilePayload) {
    if (!body?.id)
      return { error: '缺少设备配置标识' }
    const result = this.deviceProfile.update(body.id, {
      name: body.name,
      profile: body.profile
    })
    this.requestReconnect(this.deviceProfile.getAffectedAccountIdsForProfileUpdate(body.id))
    return result
  }

  @WsRoute('device.delete')
  remove(@WsBody() body: DeviceProfileDeletePayload) {
    if (!body?.id)
      return { error: '缺少设备配置标识' }
    const affectedAccountIds = this.deviceProfile.delete(body.id)
    this.emitPanelUpdate()
    this.requestReconnect(affectedAccountIds)
    return { ok: true }
  }

  @WsRoute('device.getDefault')
  getDefault() {
    return { deviceProfileId: this.deviceProfile.getDefaultProfileId() }
  }

  @WsRoute('device.setDefault')
  setDefault(@WsBody() body: DeviceDefaultPayload) {
    const deviceProfileId = body?.deviceProfileId == null ? null : String(body.deviceProfileId)
    const result = this.deviceProfile.setDefaultProfileId(deviceProfileId)
    this.emitPanelUpdate()
    this.requestReconnect(this.deviceProfile.getAccountIdsFollowingDefaultDevice())
    return { deviceProfileId: result }
  }

  private emitPanelUpdate() {
    this.eventEmitter.emit(ACCOUNT_DATA_PANEL_EVENT, {
      ui: this.globalConfig.getUI(),
      offlineReminder: this.globalConfig.getOfflineReminder(),
      remoteLoginKey: this.globalConfig.getRemoteLoginKey(),
      defaultDeviceProfileId: this.globalConfig.getDefaultDeviceProfileId()
    })
  }

  private requestReconnect(accountIds: string[]) {
    this.eventEmitter.emit(ACCOUNT_RECONNECT_REQUEST_EVENT, { accountIds })
  }
}
