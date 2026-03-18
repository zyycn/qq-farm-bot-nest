import type { ResolvedDeviceConfig } from '../../device/device-fingerprint'
import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { DeviceFingerprintService } from '../../device/device-fingerprint'
import { GameConfigService } from '../../game/game-config.service'
import { LinkClientService } from '../../game/link-client.service'
import { AccountConfigService } from '../../store/account-config.service'
import { GlobalConfigService } from '../../store/global-config.service'
import { AccountRunner } from './account-runner'

@Injectable()
export class AccountRunnerFactory {
  constructor(
    private readonly linkClient: LinkClientService,
    private readonly gameConfig: GameConfigService,
    private readonly accountConfig: AccountConfigService,
    private readonly globalConfig: GlobalConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly deviceFingerprint: DeviceFingerprintService
  ) {}

  create(accountId: string) {
    return new AccountRunner(accountId, {
      linkClient: this.linkClient,
      gameConfig: this.gameConfig,
      accountConfig: this.accountConfig,
      globalConfig: this.globalConfig,
      eventEmitter: this.eventEmitter,
      deviceFingerprint: this.deviceFingerprint
    })
  }

  createStartConfig(accountId: string, account: { code?: string | null, platform?: string | null }) {
    const deviceResolution = this.resolveDeviceConfig(accountId)
    return {
      code: String(account.code || '').trim(),
      platform: String(account.platform || 'qq'),
      clientConfig: deviceResolution.clientConfig,
      deviceResolution,
      startJitterMs: 0,
      scheduleOffsetMs: 0
    }
  }

  resolveRuntimeClient(deviceProfileId?: string | null) {
    return this.resolveDeviceConfigByProfileId(deviceProfileId).clientConfig
  }

  resolveDeviceConfig(accountId: string): ResolvedDeviceConfig {
    const accountConfig = this.accountConfig.getAccountConfig(accountId)
    return this.resolveDeviceConfigByProfileId(accountConfig.deviceProfileId)
  }

  private resolveDeviceConfigByProfileId(deviceProfileId?: string | null): ResolvedDeviceConfig {
    return this.deviceFingerprint.resolveAccountDeviceConfig(
      deviceProfileId,
      this.globalConfig.getDefaultDeviceProfileId()
    )
  }
}
