import type { AccountConfigService } from '@/modules/account/persistence/account-config.service'
import type { GameConfigService } from '@/modules/game/application/game-config.service'
import type { GameLogEntry } from '@/modules/game/domain/types'
import type { IGameTransport } from '@/modules/game/interfaces/game-transport.interface'
import { GameSession } from '@/modules/game/application/session/game-session'
import { AnalyticsWorker } from '@/modules/game/application/workers/analytics.worker'
import { DailyRewardsWorker } from '@/modules/game/application/workers/daily-rewards.worker'
import { FriendWorker } from '@/modules/game/application/workers/friend/friend.worker'
import { IllustratedWorker } from '@/modules/game/application/workers/illustrated.worker'
import { InviteWorker } from '@/modules/game/application/workers/invite.worker'
import { StatsTracker } from '@/modules/game/application/workers/stats.worker'
import { TaskWorker } from '@/modules/game/application/workers/task.worker'

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
  accountConfig: AccountConfigService
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

  const session = new GameSession(deps.accountId, deps.transport, deps.gameConfig, deps.accountConfig, stats, analytics, {
    onLog: deps.onLog,
    onLandsUpdate: deps.onLandsUpdate,
    onBagUpdate: deps.onBagUpdate
  })

  const friend = new FriendWorker(deps.accountId, deps.transport, deps.gameConfig, deps.accountConfig, deps.getSellAllFruits, deps.platform, stats)
  friend.onLog = deps.onLog

  const illustrated = new IllustratedWorker(deps.accountId, deps.transport, deps.gameConfig)
  illustrated.onLog = deps.onLog

  const task = new TaskWorker(deps.accountId, deps.transport, deps.gameConfig, deps.accountConfig, stats, deps.getRawBagItems)
  task.onLog = deps.onLog

  const dailyRewards = new DailyRewardsWorker(deps.accountId, deps.transport, deps.gameConfig, deps.platform)
  dailyRewards.onLog = deps.onLog

  const invite = new InviteWorker(deps.accountId, deps.transport, deps.platform)
  invite.onLog = deps.onLog

  return { session, friend, illustrated, task, dailyRewards, invite, stats, analytics }
}
