import { Module } from '@nestjs/common'
import { WsModule } from '@/infrastructure/ws/ws.module'
import { GlobalConfigService } from './application/global-config.service'
import { GlobalConfigRepository } from './persistence/global-config.repository'
import { PanelHandler } from './ws/panel.ws-handler'
import { SettingsWsRegistrar } from './ws/settings-ws.registrar'

@Module({
  imports: [WsModule],
  providers: [GlobalConfigRepository, GlobalConfigService, SettingsWsRegistrar, PanelHandler],
  exports: [GlobalConfigService]
})
export class SettingsModule {}
