import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { GameModule } from '../game/game.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtAuthGuard } from './jwt-auth.guard'
import { JwtStrategy } from './jwt.strategy'
import { QrController } from './qr.controller'

@Module({
  imports: [
    PassportModule,
    GameModule,
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
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard }
  ],
  exports: [AuthService, JwtModule]
})
export class AuthModule {}
