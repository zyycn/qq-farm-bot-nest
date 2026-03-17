import type { RhythmService } from '../../behavior/rhythm.service'
import type { GameConfigService } from '../../game/game-config.service'
import type { GameLogEntry } from '../../game/types'
import type { StoreService } from '../../store/store.service'
import type { IGameTransport } from '../../transport/interfaces/game-transport.interface'
import type { WorkerSet } from './worker-factory'
import { createWorkers } from './worker-factory'

export interface AccountRunnerWorkersDeps {
  accountId: string
  transport: IGameTransport
  gameConfig: GameConfigService
  store: StoreService
  rhythm: RhythmService
  onLog: (entry: GameLogEntry) => void
  onLandsUpdate: (data: unknown) => void
  onBagUpdate: (data: unknown) => void
  getSellAllFruits: () => Promise<number | void>
  getRawBagItems: () => any[]
}

export class AccountRunnerWorkers {
  constructor(private readonly deps: AccountRunnerWorkersDeps) {}

  create(platform: string): WorkerSet {
    return createWorkers({
      accountId: this.deps.accountId,
      transport: this.deps.transport,
      gameConfig: this.deps.gameConfig,
      store: this.deps.store,
      platform,
      rhythm: this.deps.rhythm,
      onLog: this.deps.onLog,
      onLandsUpdate: this.deps.onLandsUpdate,
      onBagUpdate: this.deps.onBagUpdate,
      getSellAllFruits: this.deps.getSellAllFruits,
      getRawBagItems: this.deps.getRawBagItems
    })
  }

  assign(
    target: {
      stats: WorkerSet['stats']
      analytics: WorkerSet['analytics']
      session: WorkerSet['session']
      friend: WorkerSet['friend']
      illustrated: WorkerSet['illustrated']
      task: WorkerSet['task']
      dailyRewards: WorkerSet['dailyRewards']
      invite: WorkerSet['invite']
    },
    workers: WorkerSet
  ) {
    target.stats = workers.stats
    target.analytics = workers.analytics
    target.session = workers.session
    target.friend = workers.friend
    target.illustrated = workers.illustrated
    target.task = workers.task
    target.dailyRewards = workers.dailyRewards
    target.invite = workers.invite
  }

  destroy(target: {
    session?: { destroy?: () => void }
    friend?: { destroy?: () => void }
    task?: { destroy?: () => void }
  }) {
    target.session?.destroy?.()
    target.friend?.destroy?.()
    target.task?.destroy?.()
  }
}
