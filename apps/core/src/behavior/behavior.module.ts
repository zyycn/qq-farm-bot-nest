import { Global, Module } from '@nestjs/common'
import { DeviceModule } from '../device/device.module'
import { ActionPacerService } from './action-pacer.service'
import { ActiveHoursService } from './active-hours.service'
import { BackgroundRequestService } from './background-request.service'
import { BehaviorConfigService } from './behavior-config.service'
import { BehaviorInspectService } from './behavior-inspect.service'
import { BehaviorResolverService } from './behavior-resolver.service'
import { DelayService } from './delay.service'
import { RhythmService } from './rhythm.service'
import { SessionBootstrapService } from './session-bootstrap.service'
import { SessionPatternService } from './session-pattern.service'

const services = [
  BehaviorConfigService,
  BehaviorResolverService,
  BehaviorInspectService,
  ActionPacerService,
  DelayService,
  RhythmService,
  SessionPatternService,
  SessionBootstrapService,
  BackgroundRequestService,
  ActiveHoursService
]

@Global()
@Module({
  imports: [DeviceModule],
  providers: services,
  exports: services
})
export class BehaviorModule {}
