import { Module } from '@nestjs/common'
import { StoreModule } from '../store/store.module'
import { DeviceFingerprintService } from './device-fingerprint'
import { DeviceProfileService } from './device-profile.service'

@Module({
  imports: [StoreModule],
  providers: [DeviceProfileService, DeviceFingerprintService],
  exports: [DeviceProfileService, DeviceFingerprintService]
})
export class DeviceModule {}
