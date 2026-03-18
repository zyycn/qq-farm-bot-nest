import type { EventEmitter2 } from '@nestjs/event-emitter'
import type { ClientConfig } from '@qq-farm/shared/node'
import type { AccountConfigService } from '@/modules/account/persistence/account-config.service'
import type { DeviceFingerprintService, ResolvedDeviceConfig } from '@/modules/device/application/device-fingerprint.service'
import type { GameConfigService } from '@/modules/game/application/game-config.service'
import type { LinkClientService } from '@/modules/game/application/link-client.service'
import type { AccountConfigSnapshot, FertilizerBuyConfig } from '@/modules/game/domain/constants'
import type { ConnectionEventData, OperationsEventData, ProfileEventData } from '@/modules/game/domain/types'
import type { GlobalConfigService } from '@/modules/settings/application/global-config.service'

export interface AccountRunnerConfig {
  code: string
  platform: string
  clientConfig?: ClientConfig
  deviceResolution?: ResolvedDeviceConfig
  scheduleOffsetMs?: number
  startJitterMs?: number
}

export type StatusEventName = 'connection' | 'profile' | 'session' | 'operations' | 'schedule'

export interface DailyRoutineRunOptions {
  force?: boolean
  suppressNoopLogs?: boolean
}

export interface AccountRunnerDeps {
  linkClient: LinkClientService
  gameConfig: GameConfigService
  accountConfig: AccountConfigService
  globalConfig: GlobalConfigService
  eventEmitter: EventEmitter2
  deviceFingerprint: DeviceFingerprintService
}

export interface AccountRunnerRuntimeStats {
  connection: ConnectionEventData
  status: ProfileEventData
  operations: OperationsEventData
  limits?: unknown
  sessionExpGained: number
  sessionGoldGained: number
  sessionCouponGained: number
  lastExpGain: number
  lastGoldGain: number
  uptime?: number
}

export interface AccountRunnerStatusSnapshot extends AccountRunnerRuntimeStats {
  bootAt: number
  levelProgress: unknown
  configRevision: number
  device: {
    source: ResolvedDeviceConfig['source']
    selectedKind: ResolvedDeviceConfig['selectedKind']
    selectedProfileId: string | null
    basePresetId: string | null
    usedFallback: boolean
    fallbackFields: string[]
    client: {
      platform?: string
      os?: string
      userAgent?: string
      deviceId?: string
      sysHardware?: string
    }
  } | null
  nextChecks: {
    nextFarmRunAt: number
    nextFriendRunAt: number
  }
}

export interface TaskDailyOverview {
  key: string
  doneToday: boolean
  lastClaimAt: number
  claimableCount: number
  pendingCount: number
  completedCount: number
  totalCount: number
}

export interface GrowthTaskItemOverview {
  id: number
  desc: string
  progress: number
  totalProgress: number
  isClaimed: boolean
  isUnlocked: boolean
  isCompleted: boolean
}

export interface GrowthTaskOverview {
  key: string
  doneToday: boolean
  completedCount: number
  totalCount: number
  tasks: GrowthTaskItemOverview[]
}

export interface DailyRewardCheckState {
  key: string
  doneToday: boolean
  lastCheckAt?: number
  lastClaimAt?: number
}

export { type AccountConfigSnapshot, type FertilizerBuyConfig }
