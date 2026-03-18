import type { DeviceProfile } from '@qq-farm/shared'
import type { DrizzleDB } from '@/infrastructure/database/drizzle.provider'
import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DRIZZLE_TOKEN } from '@/infrastructure/database/drizzle.provider'
import { deviceProfiles } from '@/infrastructure/database/schema'

@Injectable()
export class DeviceProfileRepository {
  constructor(@Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDB) {}

  list() {
    return this.db.select().from(deviceProfiles).all()
  }

  getById(id: string) {
    return this.db.select().from(deviceProfiles).where(eq(deviceProfiles.id, id)).get()
  }

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

  update(id: string, data: { name?: string, profile?: Partial<DeviceProfile> }) {
    const updates: { updatedAt: number, name?: string, profile?: Partial<DeviceProfile> } = { updatedAt: Date.now() }
    if (data.name !== undefined)
      updates.name = data.name
    if (data.profile !== undefined)
      updates.profile = data.profile
    this.db.update(deviceProfiles).set(updates).where(eq(deviceProfiles.id, id)).run()
    return this.getById(id)
  }

  delete(id: string): void {
    this.db.delete(deviceProfiles).where(eq(deviceProfiles.id, id)).run()
  }
}
