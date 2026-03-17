import { Injectable } from '@nestjs/common'
import { AccountRegistryService } from '../account/account-registry.service'
import { DeviceFingerprintService } from '../device/device-fingerprint'
import { StoreService } from '../store/store.service'
import { ActiveHoursService } from './active-hours.service'
import { BehaviorConfigService } from './behavior-config.service'
import { BehaviorResolverService } from './behavior-resolver.service'
import {
  BACKGROUND_COSMETIC_REQUESTS,
  BACKGROUND_REQUEST_SAMPLE_RANGE,
  BUILT_IN_SCRIPT_LEGACY_STEP_MS,
  BUILT_IN_SCRIPT_MAX_STEP_MS,
  SESSION_BOOTSTRAP_REQUESTS
} from './behavior-script.constants'

@Injectable()
export class BehaviorInspectService {
  constructor(
    private readonly behaviorConfig: BehaviorConfigService,
    private readonly behaviorResolver: BehaviorResolverService,
    private readonly activeHours: ActiveHoursService,
    private readonly deviceFingerprint: DeviceFingerprintService,
    private readonly store: StoreService,
    private readonly registry: AccountRegistryService
  ) {}

  inspect(accountId: string) {
    const stored = this.behaviorConfig.getConfig(accountId)
    const effective = this.behaviorResolver.getEffectiveConfig(accountId)
    const accountConfig = this.store.getAccountConfig(accountId)
    const resolvedDevice = this.deviceFingerprint.resolveAccountDeviceConfig(
      accountConfig.deviceProfileId,
      this.store.getDefaultDeviceProfileId()
    )
    const runnerSnapshot = this.registry.getRunner(accountId)?.getStatusSnapshot() ?? null

    return {
      stored,
      effective,
      device: {
        configured: {
          source: resolvedDevice.source,
          selectedKind: resolvedDevice.selectedKind,
          selectedProfileId: resolvedDevice.selectedProfileId,
          basePresetId: resolvedDevice.basePresetId,
          usedFallback: resolvedDevice.usedFallback,
          fallbackFields: [...resolvedDevice.fallbackFields],
          client: {
            platform: resolvedDevice.clientConfig.platform,
            os: resolvedDevice.clientConfig.os,
            userAgent: resolvedDevice.clientConfig.userAgent,
            deviceId: resolvedDevice.clientConfig.deviceInfo?.deviceId,
            sysHardware: resolvedDevice.clientConfig.deviceInfo?.sysHardware
          }
        },
        runtime: runnerSnapshot?.device ?? null
      },
      scripts: {
        quickFallbackActive: effective.quickFallbackActive,
        sessionBootstrap: {
          kind: 'built_in_script',
          enabled: effective.session.enableSessionBootstrap,
          fixedSequence: true,
          requestCount: SESSION_BOOTSTRAP_REQUESTS.length,
          requests: SESSION_BOOTSTRAP_REQUESTS.map(([service, method]) => ({ service, method })),
          pacing: {
            legacyStepMs: BUILT_IN_SCRIPT_LEGACY_STEP_MS,
            maxStepMs: BUILT_IN_SCRIPT_MAX_STEP_MS
          }
        },
        backgroundRequests: {
          kind: 'built_in_script',
          enabled: effective.backgroundRequests.enabled,
          frequency: effective.backgroundRequests.frequency,
          randomSelection: true,
          poolSize: BACKGROUND_COSMETIC_REQUESTS.length,
          sampleCountRange: { ...BACKGROUND_REQUEST_SAMPLE_RANGE },
          requests: BACKGROUND_COSMETIC_REQUESTS.map(request => ({ ...request })),
          pacing: {
            legacyStepMs: BUILT_IN_SCRIPT_LEGACY_STEP_MS,
            maxStepMs: BUILT_IN_SCRIPT_MAX_STEP_MS
          }
        },
        activeHours: {
          enabled: effective.activeHours.enabled,
          currentlyInActiveWindow: this.activeHours.isInActiveWindow(accountId),
          quietMode: effective.activeHours.quietMode,
          independentFromMasterSwitch: true
        }
      }
    }
  }
}
