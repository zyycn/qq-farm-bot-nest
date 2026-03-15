import type { SocketWithMeta } from './ws-router.service'
import { Injectable, Logger } from '@nestjs/common'
import { createEvent } from '@qq-farm/shared'
import { AccountManagerService } from '@/game/account-manager.service'
import { StoreService } from '@/store/store.service'
import { RealtimePushService } from './realtime-push.service'

interface EventConfig {
  provider: (accountId: string) => unknown | Promise<unknown>
  broadcastOnly?: boolean
}

@Injectable()
export class WsTopicsService {
  private logger = new Logger(WsTopicsService.name)
  private eventConfigs: Record<string, EventConfig>
  private broadcastOnlyEvents: Set<string>

  constructor(
    private manager: AccountManagerService,
    private store: StoreService
  ) {
    this.eventConfigs = {
      'accounts.update': {
        broadcastOnly: true,
        provider: () => this.manager.getAccounts()
      },

      'accounts.connection': {
        provider: (accountId) => {
          if (!accountId)
            return undefined
          const s = this.manager.getStatus(accountId)
          return {
            connected: s?.connection?.connected ?? false,
            accountName: s?.accountName ?? ''
          }
        }
      },

      'accounts.profile': {
        provider: (accountId) => {
          if (!accountId)
            return undefined
          if (!this.manager.getRunner(accountId))
            return undefined
          return this.manager.getStatus(accountId)?.status
        }
      },

      'accounts.session': {
        provider: (accountId) => {
          if (!accountId)
            return undefined
          if (!this.manager.getRunner(accountId))
            return undefined
          const s = this.manager.getStatus(accountId)
          if (!s)
            return undefined
          return {
            bootAt: s.bootAt,
            sessionExpGained: s.sessionExpGained,
            sessionGoldGained: s.sessionGoldGained,
            sessionCouponGained: s.sessionCouponGained,
            lastExpGain: s.lastExpGain,
            lastGoldGain: s.lastGoldGain,
            levelProgress: s.levelProgress
          }
        }
      },

      'accounts.operations': {
        provider: (accountId) => {
          if (!accountId)
            return undefined
          if (!this.manager.getRunner(accountId))
            return undefined
          return this.manager.getStatus(accountId)?.operations
        }
      },

      'accounts.schedule': {
        provider: (accountId) => {
          if (!accountId)
            return undefined
          if (!this.manager.getRunner(accountId))
            return undefined
          const s = this.manager.getStatus(accountId)
          if (!s?.nextChecks)
            return undefined
          const nowMs = Date.now()
          const { nextFarmRunAt, nextFriendRunAt } = s.nextChecks
          return {
            farmRemainSec: Math.max(0, Math.ceil(((nextFarmRunAt ?? 0) - nowMs) / 1000)),
            friendRemainSec: Math.max(0, Math.ceil(((nextFriendRunAt ?? 0) - nowMs) / 1000)),
            configRevision: s.configRevision
          }
        }
      },

      'lands.update': {
        provider: (accountId) => {
          if (!accountId)
            return undefined
          return this.manager.getRunner(accountId)?.getLands()
        }
      },

      'bag.update': {
        provider: (accountId) => {
          if (!accountId)
            return undefined
          return this.manager.getRunner(accountId)?.getBag()
        }
      },

      'dailyGifts.update': {
        provider: (accountId) => {
          if (!accountId)
            return undefined
          return this.manager.getRunner(accountId)?.getDailyGiftOverview()
        }
      },

      'friends.update': {
        provider: (accountId) => {
          if (!accountId)
            return undefined
          return this.manager.getRunner(accountId)?.getFriends()
        }
      }
    }

    this.broadcastOnlyEvents = new Set(
      Object.entries(this.eventConfigs)
        .filter(([, cfg]) => cfg.broadcastOnly)
        .map(([event]) => event)
    )
  }

  async handleSubscribe(
    client: SocketWithMeta,
    data: Record<string, unknown>
  ): Promise<{ accountId: string }> {
    const incoming = String(data?.accountId ?? '').trim()
    const topics: string[] = Array.isArray(data?.topics) ? data.topics : []
    const eventsList = (Array.isArray(data?.events) ? data.events : []).filter((e: unknown) => typeof e === 'string') as string[]
    const resolved = incoming && incoming !== 'all' ? this.manager.resolveAccountId(incoming) : ''
    const topicsSet = new Set(topics.filter((t: unknown) => t && typeof t === 'string') as string[])
    const eventsSet = new Set(eventsList.filter((e: unknown) => e && typeof e === 'string') as string[])

    client.data.accountId = resolved
    const prevTopics = client.data.topics ?? new Set<string>()
    const prevEvents = client.data.events ?? new Set<string>()
    client.data.topics = new Set([...prevTopics, ...topicsSet])
    client.data.events = new Set([...prevEvents, ...eventsSet])

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
    const topics: string[] = Array.isArray(data?.topics) ? data.topics : []
    const eventsList: string[] = (Array.isArray(data?.events) ? data.events : []).filter((e: unknown) => typeof e === 'string') as string[]
    const accountId = client.data.accountId ?? ''
    for (const event of eventsList) {
      if (accountId)
        client.leave(RealtimePushService.roomForEvent(accountId, event))
    }
    const currentTopics = client.data.topics ?? new Set<string>()
    const currentEvents = client.data.events ?? new Set<string>()
    for (const t of topics)
      currentTopics.delete(t)
    for (const e of eventsList)
      currentEvents.delete(e)
    return null
  }

  private emitToClient(client: SocketWithMeta, route: string, data: unknown): void {
    client.emit('message', createEvent(route, data))
  }

  private pushInitialData(client: SocketWithMeta, events: Set<string>): void {
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
      Promise.all(asyncTasks).catch(err => this.logger.error('pushInitialData failed:', err))
  }
}
