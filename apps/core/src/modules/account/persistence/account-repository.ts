import type { DrizzleDB } from '../../../infrastructure/database/drizzle.provider'
import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { DRIZZLE_TOKEN } from '../../../infrastructure/database/drizzle.provider'
import * as schema from '../../../infrastructure/database/schema'
import { AccountConfigService } from './account-config.service'

@Injectable()
export class AccountRepository {
  constructor(
    @Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDB,
    private readonly accountConfig: AccountConfigService
  ) {}

  getAccounts(): { accounts: any[], nextId: number } {
    const rows = this.db.select().from(schema.accounts).all()
    const maxId = rows.reduce((m, a) => Math.max(m, Number.parseInt(String(a.id), 10) || 0), 0)
    return { accounts: rows, nextId: maxId + 1 }
  }

  addOrUpdateAccount(acc: Record<string, any>): { accounts: any[], nextId: number } {
    // QQ 平台：如果未显式指定 id，但携带 uin，则先按 (uin + platform) 查重，命中则转为更新
    let dedupByUin = false
    if (!acc.id && acc.uin) {
      const uin = String(acc.uin).trim()
      const platform = String(acc.platform || 'qq').trim()
      if (uin && platform === 'qq') {
        const existingByUin = this.db.select().from(schema.accounts).where(and(eq(schema.accounts.uin, uin), eq(schema.accounts.platform, platform))).get()
        if (existingByUin) {
          acc.id = existingByUin.id
          dedupByUin = true
        }
      }
    }

    if (acc.id) {
      const existing = this.db.select().from(schema.accounts).where(eq(schema.accounts.id, String(acc.id))).get()
      if (existing) {
        const name = dedupByUin && acc.loginType === 'qr'
          ? existing.name
          : (acc.name !== undefined ? acc.name : existing.name)
        const code = acc.code !== undefined ? acc.code : existing.code
        const platform = acc.platform !== undefined ? acc.platform : existing.platform
        const uin = acc.uin !== undefined ? String(acc.uin) : existing.uin
        const qq = acc.qq !== undefined ? String(acc.qq) : existing.qq
        const avatar = acc.avatar || acc.avatarUrl || existing.avatar
        const nick = acc.nick !== undefined ? acc.nick : existing.nick
        const next = { name, code, platform, uin, qq, avatar, nick }
        const fields = ['name', 'code', 'platform', 'uin', 'qq', 'avatar', 'nick'] as const
        const hasChange = fields.some(k => existing[k] !== next[k])
        if (!hasChange) {
          this.accountConfig.ensureAccountConfig(String(acc.id))
          return this.getAccounts()
        }
        this.db.update(schema.accounts).set({
          ...next,
          updatedAt: Date.now()
        }).where(eq(schema.accounts.id, String(acc.id))).run()
        this.accountConfig.ensureAccountConfig(String(acc.id))
        return this.getAccounts()
      }
    }

    const { nextId } = this.getAccounts()
    const id = String(acc.id || nextId)
    const defaultName = `小小农夫-${String(id).padStart(2, '0')}`
    this.db.insert(schema.accounts).values({
      id,
      name: acc.name || defaultName,
      code: acc.code || '',
      platform: acc.platform || 'qq',
      uin: acc.uin ? String(acc.uin) : '',
      qq: acc.qq ? String(acc.qq) : (acc.uin ? String(acc.uin) : ''),
      avatar: acc.avatar || acc.avatarUrl || '',
      nick: acc.nick || '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }).run()
    this.accountConfig.ensureAccountConfig(id)
    return this.getAccounts()
  }

  deleteAccount(id: string | number): { accounts: any[], nextId: number } {
    this.db.delete(schema.accounts).where(eq(schema.accounts.id, String(id))).run()
    this.accountConfig.removeAccountConfig(String(id))
    return this.getAccounts()
  }

  getAllAccounts(): any[] {
    return this.db.select().from(schema.accounts).all()
  }

  getAccountById(id: string | number): any | null {
    const sid = String(id ?? '').trim()
    if (!sid)
      return null
    return this.db.select().from(schema.accounts).where(eq(schema.accounts.id, sid)).get() || null
  }

  setAccountRunning(id: string, running: boolean): void {
    this.db.update(schema.accounts).set({ running }).where(eq(schema.accounts.id, id)).run()
  }

  updateAccountCode(id: string, code: string): void {
    this.db.update(schema.accounts).set({ code, updatedAt: Date.now() }).where(eq(schema.accounts.id, id)).run()
  }
}
