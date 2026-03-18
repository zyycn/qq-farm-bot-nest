import { Module } from '@nestjs/common'
import { WsModule } from '@/infrastructure/ws/ws.module'
import { AccountDataModule } from '../account/account-data.module'
import { SettingsModule } from '../settings/settings.module'
import { DeviceFingerprintService } from './application/device-fingerprint.service'
import { DeviceProfileService } from './application/device-profile.service'
import { DeviceProfileRepository } from './persistence/device-profile.repository'
import { DeviceWsRegistrar } from './ws/device-ws.registrar'
import { DeviceHandler } from './ws/device.ws-handler'

@Module({
  imports: [AccountDataModule, SettingsModule, WsModule],
  providers: [DeviceProfileRepository, DeviceProfileService, DeviceFingerprintService, DeviceWsRegistrar, DeviceHandler],
  exports: [DeviceProfileService, DeviceFingerprintService]
})
export class DeviceModule {}
