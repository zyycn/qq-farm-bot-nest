import { Module } from '@nestjs/common'
import { DeviceFingerprintService } from './device-fingerprint'
import { DeviceProfileService } from './device-profile.service'

@Module({
  providers: [DeviceProfileService, DeviceFingerprintService],
  exports: [DeviceProfileService, DeviceFingerprintService]
})
export class DeviceModule {}
