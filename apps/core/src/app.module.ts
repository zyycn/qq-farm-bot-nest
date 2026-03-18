import path from 'node:path'
import { Module } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ScheduleModule } from '@nestjs/schedule'
import { ServeStaticModule } from '@nestjs/serve-static'
import { InfrastructureConfigModule } from './infrastructure/config/config.module'
import { ASSETS_DIR, resolveWebDist } from './infrastructure/config/paths'
import { DatabaseModule } from './infrastructure/database/database.module'
import { WsModule } from './infrastructure/ws/ws.module'
import { AccountModule } from './modules/account/account.module'
import { AuthModule } from './modules/auth/auth.module'
import { DeviceModule } from './modules/device/device.module'
import { GameModule } from './modules/game/game.module'
import { SettingsModule } from './modules/settings/settings.module'

const webDist = resolveWebDist()
const gameConfigDir = path.join(ASSETS_DIR, 'gameConfig')

const webStaticOptions = {
  fallthrough: true,
  etag: true,
  lastModified: true,
  setHeaders: (res: any, filePath: string) => {
    if (filePath.endsWith('index.html'))
      res.setHeader('Cache-Control', 'no-cache')
    else if (filePath.includes('/assets/'))
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable')
  }
}

const serveStaticModules = [
  ...(gameConfigDir
    ? [ServeStaticModule.forRoot({
        rootPath: gameConfigDir,
        serveRoot: '/game-config',
        serveStaticOptions: {
          fallthrough: true,
          etag: true,
          lastModified: true,
          maxAge: 2592000000 // 30 days
        }
      })]
    : []),
  ...(webDist ? [ServeStaticModule.forRoot({ rootPath: webDist, serveStaticOptions: webStaticOptions })] : [])
]

@Module({
  imports: [
    InfrastructureConfigModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    ...serveStaticModules,
    DatabaseModule,
    SettingsModule,
    GameModule,
    DeviceModule,
    AccountModule,
    AuthModule,
    WsModule
  ]
})
export class AppModule {}
