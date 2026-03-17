import { Injectable } from '@nestjs/common'
import { ActionPacerService } from './action-pacer.service'
import { BehaviorResolverService } from './behavior-resolver.service'

function fisherYatesShuffle<T>(items: T[]): T[] {
  const cloned = [...items]
  for (let index = cloned.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[cloned[index], cloned[swapIndex]] = [cloned[swapIndex], cloned[index]]
  }
  return cloned
}

@Injectable()
export class RhythmService {
  constructor(
    private readonly resolver: BehaviorResolverService,
    private readonly pacer: ActionPacerService
  ) {}

  shuffleOrder<T>(accountId: string, items: T[]): T[] {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (!cfg.rhythm.enableOrderShuffle)
      return items
    return fisherYatesShuffle(items)
  }

  async* friendBatches<T>(accountId: string, friends: T[]): AsyncGenerator<T[]> {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (!cfg.friend.enableBatchLimit || cfg.friend.batchSize <= 0) {
      yield friends
      return
    }

    for (let index = 0; index < friends.length; index += cfg.friend.batchSize) {
      if (index > 0)
        await this.pacer.friendBatchRest(accountId)
      yield friends.slice(index, index + cfg.friend.batchSize)
    }
  }

  shouldSkipFriend(accountId: string): boolean {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (!cfg.friend.enableRandomSkip)
      return false
    return Math.random() < cfg.friend.skipProbability
  }
}
