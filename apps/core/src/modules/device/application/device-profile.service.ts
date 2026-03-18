import type { DeviceProfile } from '@qq-farm/shared'
import { Injectable } from '@nestjs/common'
import { AccountConfigService } from '@/modules/account/persistence/account-config.service'
import { AccountRepository } from '@/modules/account/persistence/account-repository'
import { DEVICE_PRESETS } from '@/modules/device/domain/device-presets'
import { DeviceProfileRepository } from '@/modules/device/persistence/device-profile.repository'
import { GlobalConfigService } from '@/modules/settings/application/global-config.service'

@Injectable()
export class DeviceProfileService {
  constructor(
    private readonly repository: DeviceProfileRepository,
    private readonly accountRepo: AccountRepository,
    private readonly accountConfig: AccountConfigService,
    private readonly globalConfig: GlobalConfigService
  ) {}

  /** 获取所有内置预设 */
  getPresets() {
    return DEVICE_PRESETS
  }

  /** 获取所有自定义设备配置 */
  list() {
    return this.repository.list()
  }

  /** 根据 ID 获取自定义设备配置 */
  getById(id: string) {
    return this.repository.getById(id)
  }

  /** 创建自定义设备配置 */
  create(data: { id: string, name: string, presetId?: string, profile: Partial<DeviceProfile> }) {
    return this.repository.create(data)
  }

  /** 更新自定义设备配置 */
  update(id: string, data: { name?: string, profile?: Partial<DeviceProfile> }) {
    return this.repository.update(id, data)
  }

  getAffectedAccountIdsForProfileUpdate(id: string): string[] {
    const affected = new Set(this.getAccountIdsUsingProfile(id))
    if (this.globalConfig.getDefaultDeviceProfileId() === id) {
      for (const accountId of this.getAccountIdsFollowingDefaultDevice())
        affected.add(accountId)
    }
    return [...affected]
  }

  getAccountIdsFollowingDefaultDevice(): string[] {
    return this.accountRepo.getAllAccounts()
      .map(account => String(account.id))
      .filter(accountId => !this.accountConfig.getAccountConfig(accountId).deviceProfileId)
  }

  /** 删除自定义设备配置 */
  delete(id: string): string[] {
    const wasDefault = this.globalConfig.getDefaultDeviceProfileId() === id
    const affected = new Set(this.getAffectedAccountIdsForProfileUpdate(id))

    this.repository.delete(id)
    if (wasDefault)
      this.globalConfig.setDefaultDeviceProfileId(null)

    for (const accountId of this.getAccountIdsUsingProfile(id))
      this.accountConfig.setAccountConfig(accountId, { deviceProfileId: null })

    return [...affected]
  }

  getDefaultProfileId(): string | null {
    const selected = this.globalConfig.getDefaultDeviceProfileId()
    return this.isKnownProfileRef(selected) ? selected : null
  }

  setDefaultProfileId(deviceProfileId: string | null | undefined): string | null {
    const normalized = String(deviceProfileId ?? '').trim() || null
    if (normalized && !this.isKnownProfileRef(normalized))
      throw new Error('默认设备配置标识无效')
    return this.globalConfig.setDefaultDeviceProfileId(normalized)
  }

  private isKnownProfileRef(deviceProfileId: string | null | undefined): boolean {
    const normalized = String(deviceProfileId ?? '').trim()
    if (!normalized)
      return false
    if (normalized.startsWith('preset:'))
      return DEVICE_PRESETS.some(preset => preset.id === normalized.slice(7))
    return !!this.getById(normalized)
  }

  private getAccountIdsUsingProfile(deviceProfileId: string): string[] {
    return this.accountRepo.getAllAccounts()
      .map(account => String(account.id))
      .filter(accountId => this.accountConfig.getAccountConfig(accountId).deviceProfileId === deviceProfileId)
  }
}
