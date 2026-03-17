import type { DeviceProfile } from '@qq-farm/shared'
import { Injectable } from '@nestjs/common'
import { AccountLifecycleService } from '@/account/account-lifecycle.service'
import { AccountStatusService } from '@/account/account-status.service'
import { DeviceProfileService } from '../../device/device-profile.service'
import { WsBody } from '../decorators/ws-body.decorator'
import { WsRoute } from '../decorators/ws-route.decorator'

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
    private readonly lifecycle: AccountLifecycleService,
    private readonly status: AccountStatusService
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
    const affectedAccountIds = this.deviceProfile.getAffectedAccountIdsForProfileUpdate(body.id)
    this.lifecycle.reconnectAccounts(affectedAccountIds).catch(() => {})
    return result
  }

  @WsRoute('device.delete')
  remove(@WsBody() body: DeviceProfileDeletePayload) {
    if (!body?.id)
      return { error: '缺少设备配置标识' }
    const affectedAccountIds = this.deviceProfile.delete(body.id)
    this.status.notifyPanelUpdate()
    this.lifecycle.reconnectAccounts(affectedAccountIds).catch(() => {})
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
    const affectedAccountIds = this.deviceProfile.getAccountIdsFollowingDefaultDevice()
    this.status.notifyPanelUpdate()
    this.lifecycle.reconnectAccounts(affectedAccountIds).catch(() => {})
    return { deviceProfileId: result }
  }
}
