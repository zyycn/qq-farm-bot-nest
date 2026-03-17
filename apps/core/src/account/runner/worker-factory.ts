import type { GameConfigService } from '../../game/game-config.service'
import type { GameLogEntry } from '../../game/types'
import type { StoreService } from '../../store/store.service'
import type { IGameTransport } from '../../transport/interfaces/game-transport.interface'
import { GameSession } from '../../game/session/game-session'
import { AnalyticsWorker } from '../../game/workers/analytics.worker'
import { DailyRewardsWorker } from '../../game/workers/daily-rewards.worker'
import { FriendWorker } from '../../game/workers/friend/friend.worker'
import { IllustratedWorker } from '../../game/workers/illustrated.worker'
import { InviteWorker } from '../../game/workers/invite.worker'
import { StatsTracker } from '../../game/workers/stats.worker'
import { TaskWorker } from '../../game/workers/task.worker'

export interface WorkerSet {
  session: GameSession
  friend: FriendWorker
  illustrated: IllustratedWorker
  task: TaskWorker
  dailyRewards: DailyRewardsWorker
  invite: InviteWorker
  stats: StatsTracker
  analytics: AnalyticsWorker
}

export interface WorkerFactoryDeps {
  accountId: string
  transport: IGameTransport
  gameConfig: GameConfigService
  store: StoreService
  platform: string
  onLog: (entry: GameLogEntry) => void
  onLandsUpdate: (data: unknown) => void
  onBagUpdate: (data: unknown) => void
  getSellAllFruits: () => Promise<number | void>
  getRawBagItems: () => any[]
}

export function createWorkers(deps: WorkerFactoryDeps): WorkerSet {
  const stats = new StatsTracker(deps.accountId)
  const analytics = new AnalyticsWorker(deps.gameConfig)

  const session = new GameSession(deps.accountId, deps.transport, deps.gameConfig, deps.store, stats, analytics, {
    onLog: deps.onLog,
    onLandsUpdate: deps.onLandsUpdate,
    onBagUpdate: deps.onBagUpdate
  })

  const friend = new FriendWorker(deps.accountId, deps.transport, deps.gameConfig, deps.store, deps.getSellAllFruits, deps.platform, stats)
  friend.onLog = deps.onLog

  const illustrated = new IllustratedWorker(deps.accountId, deps.transport, deps.gameConfig)
  illustrated.onLog = deps.onLog

  const task = new TaskWorker(deps.accountId, deps.transport, deps.gameConfig, deps.store, stats, deps.getRawBagItems)
  task.onLog = deps.onLog

  const dailyRewards = new DailyRewardsWorker(deps.accountId, deps.transport, deps.gameConfig, deps.store, deps.platform)
  dailyRewards.onLog = deps.onLog

  const invite = new InviteWorker(deps.accountId, deps.transport, deps.platform)
  invite.onLog = deps.onLog

  return { session, friend, illustrated, task, dailyRewards, invite, stats, analytics }
}
