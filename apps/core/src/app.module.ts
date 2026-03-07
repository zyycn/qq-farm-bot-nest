import path from 'node:path'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { ServeStaticModule } from '@nestjs/serve-static'
import appConfig from './config/app.config'
import { ASSETS_DIR, resolveWebDist } from './config/paths'
import { DatabaseModule } from './database/database.module'
import { GameModule } from './game/game.module'
import { AccountModule } from './modules/account/account.module'
import { AuthModule } from './modules/auth/auth.module'
import { QrModule } from './modules/qr/qr.module'
import { RealtimeModule } from './modules/websocket/realtime.module'
import { StoreModule } from './store/store.module'

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
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    ScheduleModule.forRoot(),
    ...serveStaticModules,
    DatabaseModule,
    GameModule,
    StoreModule,
    AuthModule,
    AccountModule,
    QrModule,
    RealtimeModule
  ]
})
export class AppModule {}
