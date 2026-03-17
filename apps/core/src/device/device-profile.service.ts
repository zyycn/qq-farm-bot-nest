import type { DeviceProfile } from '@qq-farm/shared'
import type { DrizzleDB } from '../database/drizzle.provider'
import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DRIZZLE_TOKEN } from '../database/drizzle.provider'
import { deviceProfiles } from '../database/schema'
import { StoreService } from '../store/store.service'
import { DEVICE_PRESETS } from './device-presets'

@Injectable()
export class DeviceProfileService {
  constructor(
    @Inject(DRIZZLE_TOKEN) private db: DrizzleDB,
    private readonly store: StoreService
  ) {}

  /** 获取所有内置预设 */
  getPresets() {
    return DEVICE_PRESETS
  }

  /** 获取所有自定义设备配置 */
  list() {
    return this.db.select().from(deviceProfiles).all()
  }

  /** 根据 ID 获取自定义设备配置 */
  getById(id: string) {
    return this.db.select().from(deviceProfiles).where(eq(deviceProfiles.id, id)).get()
  }

  /** 创建自定义设备配置 */
  create(data: { id: string, name: string, presetId?: string, profile: Partial<DeviceProfile> }) {
    const now = Date.now()
    this.db.insert(deviceProfiles).values({
      id: data.id,
      name: data.name,
      presetId: data.presetId || null,
      profile: data.profile,
      createdAt: now,
      updatedAt: now
    }).run()
    return this.getById(data.id)
  }

  /** 更新自定义设备配置 */
  update(id: string, data: { name?: string, profile?: Partial<DeviceProfile> }) {
    const updates: { updatedAt: number, name?: string, profile?: Partial<DeviceProfile> } = { updatedAt: Date.now() }
    if (data.name !== undefined)
      updates.name = data.name
    if (data.profile !== undefined)
      updates.profile = data.profile
    this.db.update(deviceProfiles).set(updates).where(eq(deviceProfiles.id, id)).run()
    return this.getById(id)
  }

  getAffectedAccountIdsForProfileUpdate(id: string): string[] {
    const affected = new Set(this.getAccountIdsUsingProfile(id))
    if (this.store.getDefaultDeviceProfileId() === id) {
      for (const accountId of this.getAccountIdsFollowingDefaultDevice())
        affected.add(accountId)
    }
    return [...affected]
  }

  getAccountIdsFollowingDefaultDevice(): string[] {
    return this.store.getAllAccounts()
      .map(account => String(account.id))
      .filter(accountId => !this.store.getAccountConfig(accountId).deviceProfileId)
  }

  /** 删除自定义设备配置 */
  delete(id: string): string[] {
    const wasDefault = this.store.getDefaultDeviceProfileId() === id
    const affected = new Set(this.getAffectedAccountIdsForProfileUpdate(id))

    this.db.delete(deviceProfiles).where(eq(deviceProfiles.id, id)).run()
    if (wasDefault)
      this.store.setDefaultDeviceProfileId(null)

    for (const accountId of this.getAccountIdsUsingProfile(id))
      this.store.setAccountConfig(accountId, { deviceProfileId: null })

    return [...affected]
  }

  getDefaultProfileId(): string | null {
    const selected = this.store.getDefaultDeviceProfileId()
    return this.isKnownProfileRef(selected) ? selected : null
  }

  setDefaultProfileId(deviceProfileId: string | null | undefined): string | null {
    const normalized = String(deviceProfileId ?? '').trim() || null
    if (normalized && !this.isKnownProfileRef(normalized))
      throw new Error('默认设备配置标识无效')
    return this.store.setDefaultDeviceProfileId(normalized)
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
    return this.store.getAllAccounts()
      .map(account => String(account.id))
      .filter(accountId => this.store.getAccountConfig(accountId).deviceProfileId === deviceProfileId)
  }
}
