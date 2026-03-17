import type { SocketWithMeta } from './ws-router.service'
import { Injectable, Logger } from '@nestjs/common'
import { createEvent } from '@qq-farm/shared'
import { AccountLifecycleService } from '@/account/account-lifecycle.service'
import { AccountRegistryService } from '@/account/account-registry.service'
import { AccountStatusService } from '@/account/account-status.service'
import { RealtimePushService } from './realtime-push.service'

interface EventConfig {
  provider: (accountId: string) => unknown | Promise<unknown>
  broadcastOnly?: boolean
}

@Injectable()
export class WsTopicsService {
  private readonly logger = new Logger(WsTopicsService.name)
  private readonly eventConfigs: Record<string, EventConfig>
  private readonly broadcastOnlyEvents: Set<string>

  constructor(
    private readonly lifecycle: AccountLifecycleService,
    private readonly registry: AccountRegistryService,
    private readonly status: AccountStatusService
  ) {
    this.eventConfigs = {
      'accounts.update': {
        broadcastOnly: true,
        provider: () => this.status.getAccounts()
      },
      'accounts.connection': {
        provider: (accountId) => {
          if (!accountId)
            return undefined
          const snapshot = this.status.getStatus(accountId)
          return snapshot
            ? {
                connected: snapshot.connection?.connected ?? false,
                accountName: snapshot.accountName ?? ''
              }
            : undefined
        }
      },
      'accounts.profile': {
        provider: (accountId) => {
          if (!accountId || !this.registry.getRunner(accountId))
            return undefined
          return this.status.getStatus(accountId)?.status
        }
      },
      'accounts.session': {
        provider: (accountId) => {
          if (!accountId || !this.registry.getRunner(accountId))
            return undefined
          const snapshot = this.status.getStatus(accountId)
          if (!snapshot)
            return undefined
          return {
            bootAt: snapshot.bootAt,
            sessionExpGained: snapshot.sessionExpGained,
            sessionGoldGained: snapshot.sessionGoldGained,
            sessionCouponGained: snapshot.sessionCouponGained,
            lastExpGain: snapshot.lastExpGain,
            lastGoldGain: snapshot.lastGoldGain,
            levelProgress: snapshot.levelProgress
          }
        }
      },
      'accounts.operations': {
        provider: (accountId) => {
          if (!accountId || !this.registry.getRunner(accountId))
            return undefined
          return this.status.getStatus(accountId)?.operations
        }
      },
      'accounts.schedule': {
        provider: (accountId) => {
          if (!accountId || !this.registry.getRunner(accountId))
            return undefined
          const snapshot = this.status.getStatus(accountId)
          if (!snapshot?.nextChecks)
            return undefined
          const nowMs = Date.now()
          return {
            farmRemainSec: Math.max(0, Math.ceil(((snapshot.nextChecks.nextFarmRunAt ?? 0) - nowMs) / 1000)),
            friendRemainSec: Math.max(0, Math.ceil(((snapshot.nextChecks.nextFriendRunAt ?? 0) - nowMs) / 1000)),
            configRevision: snapshot.configRevision
          }
        }
      },
      'lands.update': {
        provider: async (accountId) => {
          if (!accountId)
            return undefined
          return this.registry.getRunner(accountId)?.getLands()
        }
      },
      'bag.update': {
        provider: async (accountId) => {
          if (!accountId)
            return undefined
          return this.registry.getRunner(accountId)?.getBag()
        }
      },
      'dailyGifts.update': {
        provider: async (accountId) => {
          if (!accountId)
            return undefined
          return this.registry.getRunner(accountId)?.getDailyGiftOverview()
        }
      },
      'friends.update': {
        provider: async (accountId) => {
          if (!accountId)
            return undefined
          return this.registry.getRunner(accountId)?.getFriends()
        }
      }
    }

    this.broadcastOnlyEvents = new Set(
      Object.entries(this.eventConfigs)
        .filter(([, config]) => config.broadcastOnly)
        .map(([event]) => event)
    )
  }

  async handleSubscribe(
    client: SocketWithMeta,
    data: Record<string, unknown>
  ): Promise<{ accountId: string }> {
    const incoming = String(data?.accountId ?? '').trim()
    const topics = Array.isArray(data?.topics) ? data.topics : []
    const eventsList = (Array.isArray(data?.events) ? data.events : []).filter((event: unknown) => typeof event === 'string') as string[]
    const resolved = incoming && incoming !== 'all' ? this.lifecycle.resolveAccountId(incoming) : ''
    const topicsSet = new Set(topics.filter((topic: unknown) => typeof topic === 'string' && topic) as string[])
    const eventsSet = new Set(eventsList.filter(event => !!event))

    client.data.accountId = resolved
    client.data.topics = new Set([...(client.data.topics ?? []), ...topicsSet])
    client.data.events = new Set([...(client.data.events ?? []), ...eventsSet])

    if (!client.rooms.has(RealtimePushService.ROOM_ALL))
      client.join(RealtimePushService.ROOM_ALL)

    if (resolved) {
      for (const event of eventsSet) {
        if (!this.broadcastOnlyEvents.has(event))
          client.join(RealtimePushService.roomForEvent(resolved, event))
      }
    }

    if (eventsSet.size > 0)
      this.pushInitialData(client, eventsSet)

    return { accountId: resolved || 'all' }
  }

  handleUnsubscribe(client: SocketWithMeta, data: Record<string, unknown>): null {
    const topics = Array.isArray(data?.topics) ? data.topics : []
    const eventsList = (Array.isArray(data?.events) ? data.events : []).filter((event: unknown) => typeof event === 'string') as string[]
    const accountId = client.data.accountId ?? ''

    for (const event of eventsList) {
      if (accountId)
        client.leave(RealtimePushService.roomForEvent(accountId, event))
    }

    const currentTopics = client.data.topics ?? new Set<string>()
    const currentEvents = client.data.events ?? new Set<string>()
    for (const topic of topics)
      currentTopics.delete(String(topic))
    for (const event of eventsList)
      currentEvents.delete(event)

    return null
  }

  private emitToClient(client: SocketWithMeta, route: string, data: unknown): void {
    client.emit('message', createEvent(route, data))
  }

  private pushInitialData(client: SocketWithMeta, events: Set<string>) {
    const accountId = client.data.accountId ?? ''
    const asyncTasks: Promise<void>[] = []

    for (const event of events) {
      const config = this.eventConfigs[event]
      if (!config)
        continue

      const result = config.provider(accountId)
      if (result instanceof Promise) {
        asyncTasks.push(
          result.then((data) => {
            if (data != null)
              this.emitToClient(client, event, data)
          })
        )
      } else if (result != null) {
        this.emitToClient(client, event, result)
      }
    }

    if (asyncTasks.length > 0)
      Promise.all(asyncTasks).catch(error => this.logger.error('推送初始数据失败:', error))
  }
}
