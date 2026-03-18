import { BadRequestException, Body, Controller, Post } from '@nestjs/common'
import { Public } from '../common/decorators/public.decorator'
import { QRLoginService } from '../game/workers/qrlogin.worker'

@Controller('qr')
export class QrController {
  private statusHandlers: Record<string, (result: any) => any> = {}

  constructor(private qrLogin: QRLoginService) {
    this.statusHandlers = {
      OK: async (result: any) => {
        const ticket = result.ticket
        const uin = result.uin || ''
        try {
          const authCode = await this.qrLogin.getMiniProgramAuthCode(ticket!, '1112386029')
          const avatar = uin ? `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=640` : ''
          return { status: 'OK', code: authCode, uin, avatar, nickname: result.nickname || '' }
        } catch (e: any) {
          return { status: 'Error', error: e?.message || '获取登录码失败' }
        }
      },
      Used: () => ({ status: 'Used' }),
      Wait: () => ({ status: 'Wait' }),
      Error: (result: any) => ({ status: 'Error', error: result?.msg })
    }
  }

  @Public()
  @Post('create')
  async create() {
    return this.qrLogin.requestMiniProgramLoginCode()
  }

  @Public()
  @Post('check')
  async check(@Body('code') code: string) {
    if (!code)
      throw new BadRequestException('缺少登录码')

    const result = await this.qrLogin.queryMiniProgramStatus(code)
    const handler = this.statusHandlers[result.status] ?? this.statusHandlers.Error
    return await handler(result)
  }
}
