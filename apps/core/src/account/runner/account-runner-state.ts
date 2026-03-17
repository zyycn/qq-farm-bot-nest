import type { ResolvedDeviceConfig } from '../../device/device-fingerprint'
import type { AccountConfigSnapshot } from '../../game/constants'
import type { GameConfigService } from '../../game/game-config.service'
import type { ConnectionEventData, OperationsEventData, ProfileEventData } from '../../game/types'
import type { StoreService } from '../../store/store.service'
import type { DailyRoutineRunOptions } from './account-runner-ticks'
import { Scheduler } from '@qq-farm/shared'
import { RunnerScheduler } from './runner-scheduler'

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

export interface AccountRunnerStateDeps {
  accountId: string
  scheduler: Scheduler
  scheduleController: RunnerScheduler
  store: StoreService
  gameConfig: GameConfigService
  getAppliedConfigRevision: () => number
  setAppliedConfigRevision: (revision: number) => void
  getPendingScheduleOffsetMs: () => number
  setPendingScheduleOffsetMs: (value: number) => void
  getIsRunning: () => boolean
  onSessionConfigChanged: () => void
  refreshFriendLoop: (delayMs: number) => void
  runDailyRoutines: (options?: DailyRoutineRunOptions) => Promise<void>
  runFarmOperation: (opType: string) => Promise<unknown>
  refreshIdleDisconnectTimer: () => void
  emitSchedule: () => void
  getStatusStats: () => AccountRunnerRuntimeStats
  getBootAt: () => number
  getUserState: () => {
    level: number
    exp: number
  }
  getCurrentClientConfig: () => {
    platform?: string
    os?: string
    userAgent?: string
    deviceInfo?: {
      deviceId?: string
      sysHardware?: string
    }
  } | undefined
  getCurrentDeviceResolution: () => ResolvedDeviceConfig | undefined
  getNextChecks: () => {
    nextFarmRunAt: number
    nextFriendRunAt: number
  }
}

export class AccountRunnerState {
  constructor(private readonly deps: AccountRunnerStateDeps) {}

  applyConfig(snapshot: Partial<AccountConfigSnapshot> & { __revision?: number }) {
    const revision = Number(snapshot?.__revision || 0)
    if (revision > 0)
      this.deps.setAppliedConfigRevision(revision)

    if (snapshot?.intervals)
      this.deps.scheduleController.applyIntervals(snapshot.intervals)

    this.deps.onSessionConfigChanged()
    this.deps.refreshFriendLoop(200)
    this.deps.scheduleController.reschedule()

    const pendingOffset = this.deps.getPendingScheduleOffsetMs()
    if (pendingOffset > 0) {
      this.deps.scheduleController.applyOffset(pendingOffset)
      this.deps.setPendingScheduleOffsetMs(0)
    }

    if (snapshot?.automation) {
      const auto = this.deps.store.getAutomation(this.deps.accountId)
      const cfg = this.deps.store.getAccountConfig(this.deps.accountId)
      const allDailyOn = auto.email && auto.free_gifts && auto.share_reward && auto.vip_gift && auto.month_card && auto.open_server_gift
      if (allDailyOn)
        this.deps.scheduler.setTimeoutTask('daily_routine_immediate', 400, () => this.deps.runDailyRoutines({ force: false, suppressNoopLogs: true }).catch(() => {}))
      const fert = String(cfg.fertilizer || '').toLowerCase()
      if (fert === 'both' || fert === 'organic') {
        this.deps.scheduler.setTimeoutTask('fertilizer_immediate', 600, async () => {
          if (this.deps.getIsRunning())
            await this.deps.runFarmOperation('all').catch(() => {})
        })
      }
    }

    this.deps.refreshIdleDisconnectTimer()
    this.deps.emitSchedule()
  }

  getStatusSnapshot(): AccountRunnerStatusSnapshot {
    const fullStats = this.deps.getStatusStats()
    const userState = this.deps.getUserState()
    const currentClientConfig = this.deps.getCurrentClientConfig()
    const currentDeviceResolution = this.deps.getCurrentDeviceResolution()
    const levelProgress = this.deps.gameConfig.getLevelExpProgress(userState.level || 0, userState.exp || 0)
    const { uptime: _ignored, ...rest } = fullStats
    return {
      ...rest,
      bootAt: this.deps.getBootAt(),
      levelProgress,
      configRevision: this.deps.getAppliedConfigRevision(),
      device: currentDeviceResolution
        ? {
            source: currentDeviceResolution.source,
            selectedKind: currentDeviceResolution.selectedKind,
            selectedProfileId: currentDeviceResolution.selectedProfileId,
            basePresetId: currentDeviceResolution.basePresetId,
            usedFallback: currentDeviceResolution.usedFallback,
            fallbackFields: [...currentDeviceResolution.fallbackFields],
            client: {
              platform: currentClientConfig?.platform,
              os: currentClientConfig?.os,
              userAgent: currentClientConfig?.userAgent,
              deviceId: currentClientConfig?.deviceInfo?.deviceId,
              sysHardware: currentClientConfig?.deviceInfo?.sysHardware
            }
          }
        : null,
      nextChecks: this.deps.getNextChecks()
    }
  }

  getStatus(): AccountRunnerRuntimeStats {
    return this.deps.getStatusStats()
  }
}
