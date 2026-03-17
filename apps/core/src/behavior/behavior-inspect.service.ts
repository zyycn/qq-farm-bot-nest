import type { RequestIntent } from '../common/request-intent/request-intent-context.service'
import type { GameOperationSpec } from '../game/rpc/operation-catalog'
import type { RequestCategory } from '../transport/interfaces/request-pacing.interface'
import { Injectable } from '@nestjs/common'
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core'
import { AccountRegistryService } from '../account/account-registry.service'
import { DeviceFingerprintService } from '../device/device-fingerprint'
import { GAME_OPERATION_CATALOG } from '../game/rpc/operation-catalog'
import { WS_REQUEST_INTENT_KEY } from '../realtime/decorators/request-intent.decorator'
import { WS_ROUTE_KEY } from '../realtime/decorators/ws-route.decorator'
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

type RouteIntentSummary = RequestIntent | 'default'

export interface RouteCoverageItem {
  route: string
  intent: RouteIntentSummary
}

@Injectable()
export class BehaviorInspectService {
  private routeCoverageCache: RouteCoverageItem[] | null = null

  constructor(
    private readonly behaviorConfig: BehaviorConfigService,
    private readonly behaviorResolver: BehaviorResolverService,
    private readonly activeHours: ActiveHoursService,
    private readonly deviceFingerprint: DeviceFingerprintService,
    private readonly store: StoreService,
    private readonly registry: AccountRegistryService,
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector
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
    const routeCoverage = this.getRouteCoverage()
    const routeCoverageByIntent = {
      interactive: routeCoverage.filter(item => item.intent === 'interactive').length,
      automation: routeCoverage.filter(item => item.intent === 'automation').length,
      script: routeCoverage.filter(item => item.intent === 'script').length,
      system: routeCoverage.filter(item => item.intent === 'system').length,
      default: routeCoverage.filter(item => item.intent === 'default').length
    }
    const operationEntries = Object.entries(GAME_OPERATION_CATALOG) as Array<[string, GameOperationSpec]>
    const operationCategories = operationEntries.reduce<Record<RequestCategory, number>>((acc, [, spec]) => {
      acc[spec.category] = (acc[spec.category] ?? 0) + 1
      return acc
    }, {} as Record<RequestCategory, number>)
    const operationCoverage = {
      total: operationEntries.length,
      categories: operationCategories,
      systemTraffic: {
        heartbeatDeclared: operationEntries.some(([, spec]) => spec.category === 'heartbeat'),
        activityReportDeclared: operationEntries.some(([, spec]) => spec.category === 'activity_report'),
        unresolvedCategories: (['heartbeat', 'activity_report'] as const).filter(category => !operationEntries.some(([, spec]) => spec.category === category))
      }
    }

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
      },
      requestPacing: {
        unifiedGatewayEnabled: true,
        queues: ['system', 'interactive', 'automation', 'script'],
        categoryPolicyRanges: {
          farmRead: { min: effective.delay.rapidBatchMin, max: effective.delay.rapidBatchMax },
          farmWrite: { min: effective.delay.actionMin, max: effective.delay.actionMax },
          friendVisit: { min: effective.delay.friendSwitchMin, max: effective.delay.friendSwitchMax },
          friendWrite: { min: effective.delay.actionMin, max: effective.delay.actionMax },
          warehouseWrite: { min: effective.delay.actionMin, max: effective.delay.actionMax },
          taskClaim: { min: effective.delay.taskSwitchMin, max: effective.delay.taskSwitchMax },
          dailyReward: { min: effective.delay.taskSwitchMin, max: effective.delay.taskSwitchMax },
          bootstrap: {
            min: Math.min(effective.delay.rapidBatchMin, BUILT_IN_SCRIPT_LEGACY_STEP_MS),
            max: Math.max(Math.min(effective.delay.rapidBatchMin, BUILT_IN_SCRIPT_LEGACY_STEP_MS), Math.min(effective.delay.actionMin, BUILT_IN_SCRIPT_MAX_STEP_MS))
          },
          background: {
            min: Math.min(effective.delay.rapidBatchMin, BUILT_IN_SCRIPT_LEGACY_STEP_MS),
            max: Math.max(Math.min(effective.delay.rapidBatchMin, BUILT_IN_SCRIPT_LEGACY_STEP_MS), Math.min(effective.delay.actionMin, BUILT_IN_SCRIPT_MAX_STEP_MS))
          }
        },
        quietHoursGateAppliesToBusinessTraffic: true,
        dropLowPriorityScriptRequestsWhenBusy: true,
        routeCoverage: {
          total: routeCoverage.length,
          byIntent: routeCoverageByIntent,
          routes: routeCoverage
        },
        operationCoverage
      },
      runtimeCoordination: {
        unifiedCoordinatorEnabled: true,
        session: {
          coldStartEnabled: effective.session.enableColdStart,
          coldStartRange: { min: effective.session.coldStartMin, max: effective.session.coldStartMax },
          lingerEnabled: effective.session.enableLingerAfterOps,
          lingerRange: { min: effective.session.lingerMin, max: effective.session.lingerMax },
          idleDisconnectEnabled: effective.session.enableIdleDisconnect,
          idleDisconnectRange: { min: effective.session.idleDisconnectMin, max: effective.session.idleDisconnectMax },
          bootstrapEnabled: effective.session.enableSessionBootstrap
        },
        multiAccount: {
          startJitterEnabled: effective.multiAccount.enableStartJitter,
          startJitterRange: { min: effective.multiAccount.startJitterMin, max: effective.multiAccount.startJitterMax },
          scheduleOffsetEnabled: effective.multiAccount.enableScheduleOffset,
          scheduleOffsetRange: { min: effective.multiAccount.scheduleOffsetMin, max: effective.multiAccount.scheduleOffsetMax }
        }
      }
    }
  }

  private getRouteCoverage(): RouteCoverageItem[] {
    if (this.routeCoverageCache)
      return this.routeCoverageCache

    const routes: RouteCoverageItem[] = []
    const providers = this.discovery
      .getProviders()
      .filter(wrapper => wrapper.isDependencyTreeStatic?.() && wrapper.instance)

    for (const wrapper of providers) {
      const instance = wrapper.instance as Record<string, (...args: unknown[]) => unknown>
      const proto = Object.getPrototypeOf(instance)
      if (!proto)
        continue

      this.scanner.getAllMethodNames(proto).forEach((methodName) => {
        const descriptor = Object.getOwnPropertyDescriptor(proto, methodName)
        if (!descriptor || typeof descriptor.value !== 'function')
          return

        const route = this.reflector.get<string | undefined>(WS_ROUTE_KEY, descriptor.value)
        if (!route)
          return

        const intent = this.reflector.get<RequestIntent | undefined>(WS_REQUEST_INTENT_KEY, descriptor.value) ?? 'default'
        routes.push({ route, intent })
      })
    }

    this.routeCoverageCache = routes.toSorted((left, right) => left.route.localeCompare(right.route))
    return this.routeCoverageCache
  }
}
