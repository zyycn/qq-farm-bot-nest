import { Global, Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { DeviceModule } from '../device/device.module'
import { ActionPacerService } from './action-pacer.service'
import { ActiveHoursService } from './active-hours.service'
import { BackgroundRequestService } from './background-request.service'
import { BehaviorConfigService } from './behavior-config.service'
import { BehaviorInspectService } from './behavior-inspect.service'
import { BehaviorResolverService } from './behavior-resolver.service'
import { RequestPacingGateway } from './request-pacing.gateway'
import { RhythmService } from './rhythm.service'
import { RuntimePolicyCoordinator } from './runtime-policy.coordinator'
import { SessionBootstrapService } from './session-bootstrap.service'

const services = [
  BehaviorConfigService,
  BehaviorResolverService,
  BehaviorInspectService,
  ActionPacerService,
  RequestPacingGateway,
  RhythmService,
  RuntimePolicyCoordinator,
  SessionBootstrapService,
  BackgroundRequestService,
  ActiveHoursService
]

@Global()
@Module({
  imports: [DeviceModule, DiscoveryModule],
  providers: services,
  exports: services
})
export class BehaviorModule {}
