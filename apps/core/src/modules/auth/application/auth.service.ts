import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import bcrypt from 'bcryptjs'
import { GlobalConfigService } from '@/modules/settings/application/global-config.service'

const BCRYPT_ROUNDS = 10

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private globalConfig: GlobalConfigService
  ) {}

  private async hashPassword(pwd: string): Promise<string> {
    return bcrypt.hash(String(pwd || ''), BCRYPT_ROUNDS)
  }

  private async verifyPassword(input: string, storedHash: string): Promise<boolean> {
    return bcrypt.compare(input, storedHash)
  }

  private async getAdminPasswordHash(): Promise<string> {
    return this.globalConfig.getAdminPasswordHash()
  }

  private async setAdminPasswordHash(hash: string): Promise<void> {
    this.globalConfig.setAdminPasswordHash(hash)
  }

  async login(password: string): Promise<{ token: string }> {
    const input = String(password || '')
    const storedHash = await this.getAdminPasswordHash()
    let ok = false

    if (storedHash) {
      ok = await this.verifyPassword(input, storedHash)
    } else {
      ok = input === this.configService.get<string>('app.adminPassword', 'admin')
    }

    if (!ok) {
      throw new UnauthorizedException('密码错误')
    }

    const payload = { sub: 'admin', role: 'admin' as const }
    const token = this.jwtService.sign(payload)
    return { token }
  }

  async validate(): Promise<{ valid: boolean }> {
    return { valid: true }
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < 4) {
      throw new BadRequestException('新密码长度至少为 4 位')
    }

    const storedHash = await this.getAdminPasswordHash()
    const ok = storedHash
      ? await this.verifyPassword(oldPassword, storedHash)
      : oldPassword === this.configService.get<string>('app.adminPassword', 'admin')

    if (!ok) {
      throw new BadRequestException('原密码错误')
    }

    await this.setAdminPasswordHash(await this.hashPassword(newPassword))
  }
}
