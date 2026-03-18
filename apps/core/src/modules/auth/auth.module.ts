import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { SettingsModule } from '../settings/settings.module'
import { AuthService } from './application/auth.service'
import { QRLoginService } from './application/qr-login.service'
import { AuthController } from './controllers/auth.controller'
import { QrController } from './controllers/qr.controller'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { JwtStrategy } from './strategies/jwt.strategy'

@Module({
  imports: [
    PassportModule,
    SettingsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('app.jwtSecret', 'qq-farm-bot-jwt-secret-change-me'),
        signOptions: { expiresIn: config.get<string>('app.jwtExpiresIn', '7d') as any }
      })
    })
  ],
  controllers: [AuthController, QrController],
  providers: [
    AuthService,
    QRLoginService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard }
  ],
  exports: [AuthService, JwtModule, QRLoginService]
})
export class AuthModule {}
