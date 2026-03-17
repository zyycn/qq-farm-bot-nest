import type { BehaviorConfig, EffectiveBehaviorConfig } from '@qq-farm/shared'

export interface BehaviorInspectResponse {
  stored: BehaviorConfig
  effective: EffectiveBehaviorConfig
  device: {
    configured: {
      source: 'account_profile' | 'global_default_profile' | 'built_in_default_preset'
      selectedKind: 'preset' | 'custom'
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
    }
    runtime: {
      source: 'account_profile' | 'global_default_profile' | 'built_in_default_preset'
      selectedKind: 'preset' | 'custom'
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
  }
  scripts: {
    quickFallbackActive: boolean
    sessionBootstrap: {
      kind: 'built_in_script'
      enabled: boolean
      fixedSequence: boolean
      requestCount: number
      requests: Array<{ service: string, method: string }>
      pacing: {
        legacyStepMs: number
        maxStepMs: number
      }
    }
    backgroundRequests: {
      kind: 'built_in_script'
      enabled: boolean
      frequency: number
      randomSelection: boolean
      poolSize: number
      sampleCountRange: {
        min: number
        max: number
      }
      requests: Array<{ service: string, method: string }>
      pacing: {
        legacyStepMs: number
        maxStepMs: number
      }
    }
    activeHours: {
      enabled: boolean
      currentlyInActiveWindow: boolean
      quietMode: 'disconnect' | 'heartbeat-only'
      independentFromMasterSwitch: boolean
    }
  }
  requestPacing: {
    unifiedGatewayEnabled: boolean
    queues: string[]
    categoryPolicyRanges: {
      farmRead: { min: number, max: number }
      farmWrite: { min: number, max: number }
      friendVisit: { min: number, max: number }
      friendWrite: { min: number, max: number }
      warehouseWrite: { min: number, max: number }
      taskClaim: { min: number, max: number }
      dailyReward: { min: number, max: number }
      bootstrap: { min: number, max: number }
      background: { min: number, max: number }
    }
    quietHoursGateAppliesToBusinessTraffic: boolean
    dropLowPriorityScriptRequestsWhenBusy: boolean
    routeCoverage: {
      total: number
      byIntent: {
        interactive: number
        automation: number
        script: number
        system: number
        default: number
      }
      routes: Array<{
        route: string
        intent: 'interactive' | 'automation' | 'script' | 'system' | 'default'
      }>
    }
    operationCoverage: {
      total: number
      categories: Partial<Record<
        | 'farm_read'
        | 'farm_write'
        | 'farm_cycle'
        | 'friend_visit'
        | 'friend_write'
        | 'warehouse_read'
        | 'warehouse_write'
        | 'task_claim'
        | 'task_followup'
        | 'daily_reward'
        | 'daily_reward_followup'
        | 'session_bootstrap'
        | 'background'
        | 'heartbeat'
        | 'activity_report'
        | 'generic',
        number
      >>
      systemTraffic: {
        heartbeatDeclared: boolean
        activityReportDeclared: boolean
        unresolvedCategories: Array<'heartbeat' | 'activity_report'>
      }
    }
  }
  runtimeCoordination: {
    unifiedCoordinatorEnabled: boolean
    session: {
      coldStartEnabled: boolean
      coldStartRange: { min: number, max: number }
      lingerEnabled: boolean
      lingerRange: { min: number, max: number }
      idleDisconnectEnabled: boolean
      idleDisconnectRange: { min: number, max: number }
      bootstrapEnabled: boolean
    }
    multiAccount: {
      startJitterEnabled: boolean
      startJitterRange: { min: number, max: number }
      scheduleOffsetEnabled: boolean
      scheduleOffsetRange: { min: number, max: number }
    }
  }
}
