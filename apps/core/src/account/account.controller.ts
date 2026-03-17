import { Body, Controller, Headers, HttpCode, HttpStatus, Post, UnauthorizedException } from '@nestjs/common'
import { Public } from '../common/decorators/public.decorator'
import { StoreService } from '../store/store.service'
import { AccountService } from './account.service'

@Controller('account')
export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly store: StoreService
  ) {}

  @Public()
  @Post('import-url')
  @HttpCode(HttpStatus.OK)
  async importFromUrl(
    @Body('url') url: string,
    @Headers('x-remote-login-key') remoteKey: string | undefined,
    @Headers('authorization') authorization: string | undefined
  ) {
    const configured = this.store.getRemoteLoginKey()
    const headerKey = String(remoteKey || '').trim()
    const auth = String(authorization || '').trim()
    const bearer = auth.toLowerCase().startsWith('bearer ')
      ? auth.slice('bearer '.length).trim()
      : ''
    const provided = headerKey || bearer

    if (!provided || provided !== configured)
      throw new UnauthorizedException('远程登陆密钥无效')

    await this.accountService.importFromUrl(url)
    return null
  }
}
