import type { ResolvedDeviceConfig } from '../../device/device-fingerprint'
import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { ActiveHoursService } from '../../behavior/active-hours.service'
import { BackgroundRequestService } from '../../behavior/background-request.service'
import { BehaviorResolverService } from '../../behavior/behavior-resolver.service'
import { DelayService } from '../../behavior/delay.service'
import { RhythmService } from '../../behavior/rhythm.service'
import { SessionBootstrapService } from '../../behavior/session-bootstrap.service'
import { SessionPatternService } from '../../behavior/session-pattern.service'
import { DeviceFingerprintService } from '../../device/device-fingerprint'
import { GameConfigService } from '../../game/game-config.service'
import { StoreService } from '../../store/store.service'
import { LinkClientService } from '../../transport/link-client.service'
import { AccountRunner } from './account-runner'

@Injectable()
export class AccountRunnerFactory {
  constructor(
    private readonly linkClient: LinkClientService,
    private readonly gameConfig: GameConfigService,
    private readonly store: StoreService,
    private readonly eventEmitter: EventEmitter2,
    private readonly deviceFingerprint: DeviceFingerprintService,
    private readonly delay: DelayService,
    private readonly rhythm: RhythmService,
    private readonly sessionPattern: SessionPatternService,
    private readonly sessionBootstrap: SessionBootstrapService,
    private readonly backgroundRequest: BackgroundRequestService,
    private readonly activeHours: ActiveHoursService,
    private readonly behaviorResolver: BehaviorResolverService
  ) {}

  create(accountId: string) {
    return new AccountRunner(accountId, {
      linkClient: this.linkClient,
      gameConfig: this.gameConfig,
      store: this.store,
      eventEmitter: this.eventEmitter,
      deviceFingerprint: this.deviceFingerprint,
      delay: this.delay,
      rhythm: this.rhythm,
      sessionPattern: this.sessionPattern,
      sessionBootstrap: this.sessionBootstrap,
      backgroundRequest: this.backgroundRequest,
      activeHours: this.activeHours,
      behaviorResolver: this.behaviorResolver
    })
  }

  createStartConfig(accountId: string, account: { code?: string | null, platform?: string | null }) {
    const deviceResolution = this.resolveDeviceConfig(accountId)
    return {
      code: String(account.code || '').trim(),
      platform: String(account.platform || 'qq'),
      clientConfig: deviceResolution.clientConfig,
      deviceResolution,
      startJitterMs: this.sessionPattern.getStartJitter(accountId),
      scheduleOffsetMs: this.sessionPattern.getScheduleOffset(accountId)
    }
  }

  resolveRuntimeClient(deviceProfileId?: string | null) {
    return this.resolveDeviceConfigByProfileId(deviceProfileId).clientConfig
  }

  resolveDeviceConfig(accountId: string): ResolvedDeviceConfig {
    const accountConfig = this.store.getAccountConfig(accountId)
    return this.resolveDeviceConfigByProfileId(accountConfig.deviceProfileId)
  }

  private resolveDeviceConfigByProfileId(deviceProfileId?: string | null): ResolvedDeviceConfig {
    return this.deviceFingerprint.resolveAccountDeviceConfig(
      deviceProfileId,
      this.store.getDefaultDeviceProfileId()
    )
  }
}
