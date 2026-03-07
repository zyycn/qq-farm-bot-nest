import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { AuthService } from './auth.service'

@Controller()
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body('password') password: string) {
    return this.authService.login(password)
  }

  @Get('auth/validate')
  async validate() {
    return this.authService.validate()
  }

  @Post('admin/change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body('oldPassword') oldPassword: string,
    @Body('newPassword') newPassword: string
  ) {
    await this.authService.changePassword(oldPassword, newPassword)
    return null
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout() {
    return null
  }
}
