import type { CreateAccountPayload, LinkUserState } from '../game/types'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { GameLogService } from '../game/game-log.service'
import { AccountRepository } from '../store/account-repository'
import { AccountLifecycleService } from './account-lifecycle.service'
import { AccountStatusService } from './account-status.service'

@Injectable()
export class AccountService {
  private importLocks = new Map<string, Promise<null>>()

  constructor(
    private readonly lifecycle: AccountLifecycleService,
    private readonly status: AccountStatusService,
    private readonly accountRepo: AccountRepository,
    private readonly gameLog: GameLogService
  ) {}

  getAccounts() {
    return this.status.getAccounts()
  }

  async createOrUpdateAccount(payload: CreateAccountPayload) {
    const skipAutoStart = payload?.skipAutoStart === true
    const isUpdateById = !!payload.id
    const resolvedUpdateId = isUpdateById ? this.lifecycle.resolveAccountId(payload.id) : ''
    const body = isUpdateById ? { ...payload, id: resolvedUpdateId || String(payload.id) } : payload

    const before = this.status.getAccounts()
    const beforeAccounts = before.accounts || []

    const targetBefore = isUpdateById
      ? beforeAccounts.find(account => String(account.id) === String(body.id))
      : (payload.uin && (payload.platform || 'qq') === 'qq')
          ? beforeAccounts.find(account => String(account.uin) === String(payload.uin) && String(account.platform || 'qq') === String(payload.platform || 'qq'))
          : undefined

    const data = this.accountRepo.addOrUpdateAccount(body)
    const afterAccounts = data.accounts || []

    let targetAfter = (payload.uin && (payload.platform || 'qq') === 'qq')
      ? afterAccounts.find(account => String(account.uin) === String(payload.uin) && String(account.platform || 'qq') === String(payload.platform || 'qq'))
      : undefined

    if (!targetAfter && isUpdateById)
      targetAfter = afterAccounts.find(account => String(account.id) === String(body.id))

    const accountId = targetAfter
      ? String(targetAfter.id)
      : (isUpdateById ? String(body.id) : String((afterAccounts.at(-1) || {}).id || ''))

    const effectiveIsUpdate = !!targetBefore
    const loginType = String(payload?.loginType || '').trim()
    const hasLoginCodeUpdate = payload?.code !== undefined && String(payload.code || '').trim() !== ''
    const displayName = (targetAfter && (targetAfter.name || targetAfter.nick)) || body.name || ''

    this.gameLog.addAccountLog(
      effectiveIsUpdate ? 'update' : 'add',
      effectiveIsUpdate ? `更新账号: ${displayName || accountId}` : `添加账号: ${displayName || accountId}`,
      accountId,
      displayName
    )

    if (loginType === 'manual' && hasLoginCodeUpdate) {
      this.gameLog.appendLog(accountId, displayName, {
        msg: `手动填码更新登录信息${effectiveIsUpdate ? '' : '并添加账号'}${displayName ? `: ${displayName}` : ''}`,
        tag: '系统',
        meta: { module: 'system', event: 'login_manual' }
      })
    }

    if (!effectiveIsUpdate && !skipAutoStart) {
      const newAccount = afterAccounts.find(account => String(account.id) === accountId) || afterAccounts.at(-1)
      if (newAccount)
        await this.lifecycle.startAccount(String(newAccount.id))
    }

    await this.lifecycle.syncGhostConnections()
    this.status.notifyAccountsUpdate()
    return this.status.getAccounts()
  }

  async deleteAccount(id: string) {
    const resolvedId = this.lifecycle.resolveAccountId(id) || String(id)
    const accounts = this.status.getAccounts().accounts || []
    const target = accounts.find(account => String(account.id) === resolvedId)

    await this.lifecycle.stopAccount(resolvedId)
    await this.lifecycle.disconnectFromLink(resolvedId)
    const data = this.accountRepo.deleteAccount(resolvedId)
    this.gameLog.deleteAccountLogs(resolvedId)
    await this.lifecycle.syncGhostConnections()

    this.gameLog.addAccountLog('delete', `删除账号: ${(target && target.name) || id}`, resolvedId, target ? target.name : '')
    this.status.notifyAccountsUpdate()
    return data
  }

  async startAccount(id: string) {
    const resolvedId = (this.lifecycle.resolveAccountId(id) || String(id || '').trim()).trim()
    if (!resolvedId)
      throw new NotFoundException('账号未找到')

    const account = this.accountRepo.getAccountById(resolvedId)
    if (!account)
      throw new NotFoundException('账号未找到')
    if (!account.code || String(account.code).trim() === '')
      throw new NotFoundException('请先扫码登录获取登录码后再启动')

    const ok = await this.lifecycle.startAccount(resolvedId)
    if (!ok)
      throw new NotFoundException('账号已在运行中')
    return null
  }

  async stopAccount(id: string) {
    const resolvedId = this.lifecycle.resolveAccountId(id)
    await this.lifecycle.stopAccount(resolvedId)
    return null
  }

  updateRemark(body: { id?: string, accountId?: string, uin?: string, remark?: string, name?: string }) {
    const rawRef = body.id || body.accountId || body.uin || ''
    const resolvedId = this.lifecycle.resolveAccountId(rawRef)
    const accounts = this.status.getAccounts().accounts || []
    const target = accounts.find(account => String(account.id) === resolvedId)

    if (!target?.id)
      throw new NotFoundException('账号未找到')

    const remark = String(body.remark ?? body.name ?? '').trim()
    if (!remark)
      throw new NotFoundException('缺少备注')

    this.accountRepo.addOrUpdateAccount({ id: String(target.id), name: remark })
    this.lifecycle.setRuntimeAccountName(String(target.id), remark)
    this.gameLog.addAccountLog('update', `更新账号备注: ${remark}`, String(target.id), remark)
    this.status.notifyAccountsUpdate()

    return this.status.getAccounts()
  }

  getAccountLogs(limit: number) {
    return this.status.getAccountLogs(limit)
  }

  async importFromUrl(url: string) {
    const raw = typeof url === 'string' ? url.trim() : ''
    if (!raw)
      throw new BadRequestException('缺少链接参数')

    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch {
      throw new BadRequestException('无效的链接')
    }

    const code = parsed.searchParams.get('code')?.trim()
    const platform = parsed.searchParams.get('platform')?.trim() || 'qq'
    if (!code)
      throw new BadRequestException('链接中缺少登录码参数')

    const lockKey = '__import__'
    if (this.importLocks.has(lockKey))
      throw new BadRequestException('已有账号正在导入中，请稍后再试')

    const lockPromise = this.doImport(code, platform)
    this.importLocks.set(lockKey, lockPromise)
    try {
      await lockPromise
      return null
    } finally {
      this.importLocks.delete(lockKey)
    }
  }

  private async doImport(code: string, platform: string): Promise<null> {
    const normalizedPlatform = (platform || 'qq').trim() || 'qq'

    let tempId: string
    let userState: LinkUserState | undefined
    try {
      const result = await this.lifecycle.connectForImport(code, normalizedPlatform)
      tempId = result.tempId
      userState = result.userState
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      throw new BadRequestException(`无法连接游戏服务器，请检查登录码是否有效: ${message}`)
    }

    const openId = String(userState?.openId || '').trim()
    if (!openId)
      throw new BadRequestException('无法获取账号信息，请检查登录码是否有效')

    const nameFromGame = String(userState?.name || '').trim()
    const avatarFromGame = String(userState?.avatarUrl || '').trim()
    const all = this.status.getAccounts().accounts || []
    const existing = all.find(account =>
      String(account.uin || '').trim() === openId
      && String(account.platform || 'qq') === normalizedPlatform
    )

    const importPayload: CreateAccountPayload = {
      code,
      platform: normalizedPlatform,
      uin: openId,
      skipAutoStart: true
    }

    let targetId: string
    if (existing) {
      importPayload.id = String(existing.id)
      if (!existing.name || existing.name === `小小农夫-${String(existing.id).padStart(2, '0')}`)
        importPayload.nick = nameFromGame || existing.nick || ''
      if (avatarFromGame)
        importPayload.avatar = avatarFromGame
      const result = await this.createOrUpdateAccount(importPayload)
      const updated = result.accounts || []
      const target = updated.find(account => String(account.id) === String(existing.id))
      targetId = String((target || existing).id)
    } else {
      if (nameFromGame)
        importPayload.nick = nameFromGame
      if (avatarFromGame)
        importPayload.avatar = avatarFromGame
      const result = await this.createOrUpdateAccount(importPayload)
      const updated = result.accounts || []
      const target = updated.find(account =>
        String(account.uin || '').trim() === openId
        && String(account.platform || 'qq') === normalizedPlatform
      ) ?? updated.at(-1)
      if (!target)
        throw new BadRequestException('导入账号失败：未能创建账号记录')
      targetId = String(target.id)
    }

    await this.lifecycle.rebindLinkConnection(tempId, targetId)

    const name = nameFromGame || ''
    this.gameLog.appendLog(targetId, name, {
      msg: `远程链接导入并启动 ${name || targetId}`,
      tag: '系统',
      meta: { module: 'system', event: 'login_remote' }
    })
    this.gameLog.addAccountLog('import_url', `通过链接导入并启动 ${name || targetId}`, targetId, name || '')
    await this.lifecycle.startAccount(targetId)
    this.status.notifyAccountsUpdate()
    return null
  }
}
