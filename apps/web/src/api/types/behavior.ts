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
}
