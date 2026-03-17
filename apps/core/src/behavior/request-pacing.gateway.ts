import type {
  RequestEnvelope,
  RequestExecutionResult,
  RequestPolicy,
  RequestQueue
} from '../transport/interfaces/request-pacing.interface'
import { Injectable, Logger } from '@nestjs/common'
import { RequestIntentContextService } from '../common/request-intent/request-intent-context.service'
import { ActiveHoursService } from './active-hours.service'
import { BehaviorResolverService } from './behavior-resolver.service'

interface QueuedRequest<T = unknown> {
  createdAt: number
  envelope: Required<Pick<RequestEnvelope, 'service' | 'method' | 'params'>> & RequestEnvelope & { policy: RequestPolicy, queue: RequestQueue }
  resolve: (value: RequestExecutionResult<T>) => void
  reject: (reason?: unknown) => void
  execute: () => Promise<RequestExecutionResult<T>>
}

interface AccountQueueState {
  active: boolean
  lastSentAt: number
  categoryLastSentAt: Partial<Record<RequestPolicy['category'], number>>
  queues: Record<RequestQueue, QueuedRequest[]>
}

function randomBetween(min: number, max: number): number {
  const lower = Math.max(0, Math.floor(Math.min(min, max)))
  const upper = Math.max(lower, Math.floor(Math.max(min, max)))
  return lower + Math.floor(Math.random() * (upper - lower + 1))
}

@Injectable()
export class RequestPacingGateway {
  private static readonly DEFAULT_QUEUE_WAIT_TIMEOUT_MS = 15_000
  private static readonly DEFAULT_INVOKE_TIMEOUT_MS = 10_000
  private static readonly DEFAULT_MAX_QUEUE_DELAY_MS = 30_000

  private readonly logger = new Logger(RequestPacingGateway.name)
  private readonly accountStates = new Map<string, AccountQueueState>()

  constructor(
    private readonly behaviorResolver: BehaviorResolverService,
    private readonly activeHours: ActiveHoursService
  ) {}

  invoke<T>(
    accountId: string,
    envelope: RequestEnvelope,
    execute: () => Promise<RequestExecutionResult<T>>
  ): Promise<RequestExecutionResult<T>> {
    const normalized = this.normalizeEnvelope(envelope)
    const state = this.getAccountState(accountId)

    return new Promise((resolve, reject) => {
      const item: QueuedRequest<T> = {
        createdAt: Date.now(),
        envelope: normalized,
        resolve,
        reject,
        execute
      }

      if (normalized.dropIfQueueBusy && this.getQueueDepth(state) > 0) {
        this.logger.debug(this.formatAuditLog(accountId, normalized, 0, 0, 'dropped_by_policy', {
          droppedByPolicy: true
        }))
        reject(new Error(`Request dropped by pacing policy: ${normalized.service}.${normalized.method}`))
        return
      }

      state.queues[normalized.queue].push(item)
      void this.processQueue(accountId, state)
    })
  }

  private async processQueue(accountId: string, state: AccountQueueState): Promise<void> {
    if (state.active)
      return

    state.active = true
    try {
      while (true) {
        const item = this.takeNext(state)
        if (!item)
          return

        const queuedForMs = Date.now() - item.createdAt
        const queueWaitTimeoutMs = item.envelope.queueWaitTimeoutMs ?? RequestPacingGateway.DEFAULT_QUEUE_WAIT_TIMEOUT_MS
        const maxQueueDelayMs = item.envelope.maxQueueDelayMs ?? RequestPacingGateway.DEFAULT_MAX_QUEUE_DELAY_MS
        if (queuedForMs > queueWaitTimeoutMs || queuedForMs > maxQueueDelayMs) {
          this.logger.debug(this.formatAuditLog(accountId, item.envelope, queuedForMs, 0, 'queue_wait_timeout', {
            queueWaitTimeoutMs,
            maxQueueDelayMs
          }))
          item.reject(new Error(`Request queue wait timeout: ${item.envelope.service}.${item.envelope.method}`))
          continue
        }

        if (!this.canRunInCurrentHours(accountId, item.envelope.policy)) {
          this.logger.debug(this.formatAuditLog(accountId, item.envelope, queuedForMs, 0, 'suppressed_by_quiet_hours', {
            queueWaitTimeoutMs,
            maxQueueDelayMs,
            suppressedByQuietHours: true
          }))
          item.reject(new Error(`Request suppressed by quiet hours: ${item.envelope.service}.${item.envelope.method}`))
          continue
        }

        const appliedDelayMs = this.computeDelayMs(accountId, state, item.envelope.policy)
        if (appliedDelayMs > 0)
          await this.sleep(appliedDelayMs)

        try {
          const result = await item.execute()
          const sentAt = Date.now()
          state.lastSentAt = sentAt
          state.categoryLastSentAt[item.envelope.policy.category] = sentAt
          this.logger.debug(this.formatAuditLog(accountId, item.envelope, queuedForMs, appliedDelayMs, 'sent', {
            queueWaitTimeoutMs,
            maxQueueDelayMs,
            invokeTimeoutMs: item.envelope.invokeTimeoutMs ?? RequestPacingGateway.DEFAULT_INVOKE_TIMEOUT_MS
          }))
          item.resolve(result)
        } catch (error) {
          this.logger.debug(this.formatAuditLog(accountId, item.envelope, queuedForMs, appliedDelayMs, 'invoke_failed', {
            queueWaitTimeoutMs,
            maxQueueDelayMs,
            invokeTimeoutMs: item.envelope.invokeTimeoutMs ?? RequestPacingGateway.DEFAULT_INVOKE_TIMEOUT_MS,
            error: error instanceof Error ? error.message : String(error || '')
          }))
          item.reject(error)
        }
      }
    } finally {
      state.active = false
      if (this.getQueueDepth(state) > 0)
        void this.processQueue(accountId, state)
    }
  }

  private normalizeEnvelope(envelope: RequestEnvelope): QueuedRequest['envelope'] {
    const policy = this.normalizePolicy(envelope.policy)
    return {
      ...envelope,
      service: envelope.service,
      method: envelope.method,
      params: envelope.params ?? {},
      policy,
      queue: envelope.queue ?? this.resolveQueue(policy)
    }
  }

  private normalizePolicy(policy?: Partial<RequestPolicy>): RequestPolicy {
    return {
      category: policy?.category ?? 'generic',
      risk: policy?.risk ?? 'medium',
      source: policy?.source ?? 'business',
      batchKey: policy?.batchKey,
      immediate: policy?.immediate ?? false,
      allowInQuietHours: policy?.allowInQuietHours ?? false
    }
  }

  private resolveQueue(policy: RequestPolicy): RequestQueue {
    switch (policy.source) {
      case 'system':
        return 'system'
      case 'interactive':
        return 'interactive'
      case 'bootstrap':
      case 'background':
        return 'script'
      default:
        return 'automation'
    }
  }

  private canRunInCurrentHours(accountId: string, policy: RequestPolicy): boolean {
    if (policy.allowInQuietHours)
      return true
    if (policy.source === 'system')
      return true
    return this.activeHours.isInActiveWindow(accountId)
  }

  private computeDelayMs(accountId: string, state: AccountQueueState, policy: RequestPolicy): number {
    if (policy.immediate)
      return 0

    const cfg = this.behaviorResolver.getEffectiveConfig(accountId)
    let min = cfg.delay.actionMin
    let max = cfg.delay.actionMax

    switch (policy.category) {
      case 'farm_read':
      case 'warehouse_read':
        min = cfg.delay.rapidBatchMin
        max = cfg.delay.rapidBatchMax
        break
      case 'farm_write':
      case 'friend_write':
      case 'warehouse_write':
        min = cfg.delay.actionMin
        max = cfg.delay.actionMax
        break
      case 'farm_cycle':
        min = cfg.delay.actionMin
        max = cfg.delay.actionMax
        break
      case 'friend_visit':
        min = cfg.delay.friendSwitchMin
        max = cfg.delay.friendSwitchMax
        break
      case 'task_claim':
      case 'daily_reward':
      case 'task_followup':
      case 'daily_reward_followup':
        min = cfg.delay.taskSwitchMin
        max = cfg.delay.taskSwitchMax
        break
      case 'session_bootstrap':
      case 'background':
        min = Math.min(cfg.delay.rapidBatchMin, 20)
        max = Math.max(min, Math.min(cfg.delay.actionMin, 120))
        break
      case 'heartbeat':
      case 'activity_report': {
        const lastSentAt = state.categoryLastSentAt[policy.category] ?? 0
        const minIntervalMs = policy.category === 'heartbeat' ? 24_000 : 3_000
        return Math.max(0, minIntervalMs - (Date.now() - lastSentAt))
      }
      case 'generic':
        break
    }

    if (policy.risk === 'high')
      max = Math.max(max, min + Math.round((max - min) * 0.35))

    return randomBetween(min, max)
  }

  private getAccountState(accountId: string): AccountQueueState {
    let state = this.accountStates.get(accountId)
    if (!state) {
      state = {
        active: false,
        lastSentAt: 0,
        categoryLastSentAt: {},
        queues: {
          system: [],
          interactive: [],
          automation: [],
          script: []
        }
      }
      this.accountStates.set(accountId, state)
    }
    return state
  }

  private takeNext(state: AccountQueueState): QueuedRequest | undefined {
    return state.queues.system.shift()
      ?? state.queues.interactive.shift()
      ?? state.queues.automation.shift()
      ?? state.queues.script.shift()
  }

  private getQueueDepth(state: AccountQueueState): number {
    return state.queues.system.length
      + state.queues.interactive.length
      + state.queues.automation.length
      + state.queues.script.length
  }

  private formatAuditLog(
    accountId: string,
    envelope: QueuedRequest['envelope'],
    queuedForMs: number,
    appliedDelayMs: number,
    status: 'sent' | 'queue_wait_timeout' | 'suppressed_by_quiet_hours' | 'dropped_by_policy' | 'invoke_failed',
    extra: Record<string, unknown> = {}
  ): string {
    const requestContext = RequestIntentContextService.getCurrent()
    return JSON.stringify({
      accountId,
      requestId: requestContext?.requestId,
      triggerRoute: requestContext?.route,
      triggerIntent: requestContext?.intent,
      service: envelope.service,
      method: envelope.method,
      category: envelope.policy.category,
      risk: envelope.policy.risk,
      source: envelope.policy.source,
      queue: envelope.queue,
      status,
      queuedForMs,
      appliedDelayMs,
      ...extra
    })
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
