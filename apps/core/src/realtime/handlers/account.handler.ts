import { Injectable } from '@nestjs/common'
import { AccountService } from '@/account/account.service'
import { WsBody } from '../decorators/ws-body.decorator'
import { WsRoute } from '../decorators/ws-route.decorator'
import { requireString } from '../ws-guards'

@Injectable()
export class AccountHandler {
  constructor(private readonly accountService: AccountService) {}

  @WsRoute('accounts.start')
  async start(@WsBody() data: Record<string, unknown>): Promise<null> {
    const id = requireString(data, 'id', '缺少账号 id')
    await this.accountService.startAccount(id)
    return null
  }

  @WsRoute('accounts.stop')
  async stop(@WsBody() data: Record<string, unknown>): Promise<null> {
    const id = requireString(data, 'id', '缺少账号 id')
    await this.accountService.stopAccount(id)
    return null
  }

  @WsRoute('accounts.upsert')
  async create(@WsBody() data: Record<string, unknown>): Promise<unknown> {
    return this.accountService.createOrUpdateAccount(data || {})
  }

  @WsRoute('accounts.delete')
  async delete(@WsBody() data: Record<string, unknown>): Promise<unknown> {
    const id = requireString(data, 'id', '缺少账号 id')
    return this.accountService.deleteAccount(id)
  }

  @WsRoute('accounts.remark')
  async remark(@WsBody() data: Record<string, unknown>): Promise<unknown> {
    return this.accountService.updateRemark(data || {})
  }
}
