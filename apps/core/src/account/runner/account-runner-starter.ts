import type { ClientConfig } from '@qq-farm/shared/node'
import type { RuntimePolicyCoordinator } from '../../behavior/runtime-policy.coordinator'
import type { DeviceFingerprintService, ResolvedDeviceConfig } from '../../device/device-fingerprint'
import type { StoreService } from '../../store/store.service'
import type { AccountRunnerConfig } from './account-runner'

export interface PreparedRunnerStart {
  startConfig: AccountRunnerConfig
  pendingScheduleOffsetMs: number
  currentClientConfig: ClientConfig | undefined
  currentDeviceResolution: ResolvedDeviceConfig
  startJitterMs: number
  initialConfigSnapshot: Record<string, unknown> & { __revision: number }
}

export interface StartStateTarget {
  isRunning: boolean
  startConfig: AccountRunnerConfig | null
  pendingScheduleOffsetMs: number
  currentClientConfig: ClientConfig | undefined
  currentDeviceResolution: ResolvedDeviceConfig | undefined
}

export interface AccountRunnerStarterDeps {
  accountId: string
  store: StoreService
  runtimePolicy: RuntimePolicyCoordinator
  deviceFingerprint: DeviceFingerprintService
  getAppliedConfigRevision: () => number
}

export class AccountRunnerStarter {
  constructor(private readonly deps: AccountRunnerStarterDeps) {}

  prepare(config: AccountRunnerConfig): PreparedRunnerStart {
    const deviceResolution = config.deviceResolution
      ?? this.deps.deviceFingerprint.resolveAccountDeviceConfig(
        this.deps.store.getAccountConfig(this.deps.accountId).deviceProfileId,
        this.deps.store.getDefaultDeviceProfileId()
      )
    return {
      startConfig: { ...config },
      pendingScheduleOffsetMs: Math.max(0, Number(config.scheduleOffsetMs) || 0),
      currentClientConfig: config.clientConfig ?? deviceResolution.clientConfig,
      currentDeviceResolution: deviceResolution,
      startJitterMs: Math.max(0, Number(config.startJitterMs) || 0),
      initialConfigSnapshot: {
        ...this.deps.store.getConfigSnapshot(this.deps.accountId),
        __revision: Math.max(1, this.deps.getAppliedConfigRevision() || 1)
      }
    }
  }

  async applyStartJitter(startJitterMs: number) {
    await this.deps.runtimePolicy.applyStartJitter(startJitterMs)
  }

  beginStart(target: StartStateTarget, prepared: PreparedRunnerStart) {
    target.isRunning = true
    target.startConfig = prepared.startConfig
    target.pendingScheduleOffsetMs = prepared.pendingScheduleOffsetMs
    target.currentClientConfig = prepared.currentClientConfig
    target.currentDeviceResolution = prepared.currentDeviceResolution
  }
}
