import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { Public } from '@/common/decorators/public.decorator'
import { AuthService } from '@/modules/auth/application/auth.service'
import { ChangePasswordDto } from '@/modules/auth/dto/change-password.dto'
import { LoginDto } from '@/modules/auth/dto/login.dto'

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.password)
  }

  @Get('validate')
  async validate() {
    return this.authService.validate()
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(@Body() dto: ChangePasswordDto) {
    await this.authService.changePassword(dto.oldPassword, dto.newPassword)
    return null
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout() {
    return null
  }
}
