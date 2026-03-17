import type { StoreService } from '../../../store/store.service'
import type { GameConfigService } from '../../game-config.service'
import type { FriendLandAnalysis } from './friend-land-analysis'
import { RE_TIME_HH_MM } from '../../utils'
import { buildFriendVisitCandidates } from './friend-list'

export interface FriendCycleHandlerDeps {
  accountId: string
  store: StoreService
  gameConfig: GameConfigService
  getMyGid: () => number
  getAllFriends: () => Promise<any>
  enterFriendFarm: (gid: number) => Promise<any>
  leaveFriendFarm: (gid: number) => Promise<void>
  analyzeFriendLands: (lands: any[], myGid: number) => FriendLandAnalysis
  checkDailyReset: () => void
  canOperate: (opId: number) => boolean
  shouldSkipFriendVisit: () => boolean
  shuffleOrder: <T>(items: T[]) => T[]
  friendBatches: <T>(items: T[]) => AsyncGenerator<T[]>
  sellAllFruits: () => Promise<number | void>
  executeHelpOps: (gid: number, status: FriendLandAnalysis, stopWhenExpLimit: boolean, totalActions: Record<string, number>) => Promise<string[]>
  executeStealOps: (gid: number, status: FriendLandAnalysis, totalActions: Record<string, number>) => Promise<string[]>
  executeBadOps: (gid: number, status: FriendLandAnalysis, totalActions: Record<string, number>) => Promise<string[]>
  getCanGetHelpExp: () => boolean
  setCanGetHelpExp: (value: boolean) => void
  log: (msg: string, event?: string) => void
  warn: (msg: string, event?: string) => void
}

export class FriendCycleHandler {
  constructor(private readonly deps: FriendCycleHandlerDeps) {}

  inFriendQuietHours(): boolean {
    const cfg = this.deps.store.getFriendQuietHours(this.deps.accountId)
    if (!cfg?.enabled)
      return false
    const parseTime = (s: string) => {
      const m = String(s || '').match(RE_TIME_HH_MM)
      if (!m)
        return null
      const h = Number.parseInt(m[1], 10)
      const min = Number.parseInt(m[2], 10)
      return (h >= 0 && h <= 23 && min >= 0 && min <= 59) ? h * 60 + min : null
    }
    const start = parseTime(cfg.start)
    const end = parseTime(cfg.end)
    if (start === null || end === null)
      return false
    const cur = new Date().getHours() * 60 + new Date().getMinutes()
    if (start === end)
      return true
    return start < end ? (cur >= start && cur < end) : (cur >= start || cur < end)
  }

  async visitFriend(friend: { gid: number, name: string }, totalActions: Record<string, number>) {
    const { gid, name } = friend
    let enterReply: any
    try {
      enterReply = await this.deps.enterFriendFarm(gid)
    } catch (e: any) {
      this.deps.warn(`进入 ${name} 农场失败: ${e?.message}`, 'visit_friend')
      return
    }

    const lands = enterReply.lands || []
    if (!lands.length) {
      await this.deps.leaveFriendFarm(gid)
      return
    }

    const status = this.deps.analyzeFriendLands(lands, this.deps.getMyGid())

    const stealBlacklist = new Set(this.deps.store.getStealCropBlacklist(this.deps.accountId))
    if (stealBlacklist.size > 0) {
      status.stealableInfo = status.stealableInfo.filter((info: any) => {
        const plant = this.deps.gameConfig.getPlantById(info.plantId)
        if (!plant?.seed_id)
          return true
        return !stealBlacklist.has(plant.seed_id)
      })
      status.stealable = status.stealableInfo.map((x: any) => x.landId)
    }

    const actions: string[] = []
    const helpEnabled = this.deps.store.isAutomationOn('friend_help', this.deps.accountId)
    const stopWhenExpLimit = this.deps.store.isAutomationOn('friend_help_exp_limit', this.deps.accountId)
    if (!stopWhenExpLimit)
      this.deps.setCanGetHelpExp(true)

    if (helpEnabled && !(stopWhenExpLimit && !this.deps.getCanGetHelpExp())) {
      const helpActions = await this.deps.executeHelpOps(gid, status, stopWhenExpLimit, totalActions)
      actions.push(...helpActions)
    }

    if (this.deps.store.isAutomationOn('friend_steal', this.deps.accountId) && status.stealable.length > 0) {
      const stealActions = await this.deps.executeStealOps(gid, status, totalActions)
      actions.push(...stealActions)
    }

    if (this.deps.store.isAutomationOn('friend_bad', this.deps.accountId)) {
      const badActions = await this.deps.executeBadOps(gid, status, totalActions)
      actions.push(...badActions)
    }

    if (actions.length > 0)
      this.deps.log(`${name}: ${actions.join('/')}`, 'visit_friend')
    await this.deps.leaveFriendFarm(gid)
  }

  async checkFriends(): Promise<boolean> {
    if (!this.deps.store.isAutomationOn('friend', this.deps.accountId))
      return false
    const helpOn = this.deps.store.isAutomationOn('friend_help', this.deps.accountId)
    const stealOn = this.deps.store.isAutomationOn('friend_steal', this.deps.accountId)
    const badOn = this.deps.store.isAutomationOn('friend_bad', this.deps.accountId)
    if (!this.deps.getMyGid() || !(helpOn || stealOn || badOn))
      return false
    if (this.inFriendQuietHours())
      return false

    this.deps.checkDailyReset()

    try {
      const reply = await this.deps.getAllFriends()
      const friends = reply.game_friends || []
      if (!friends.length) {
        this.deps.log('没有好友', 'friend_cycle')
        return false
      }

      const myGid = this.deps.getMyGid()
      const blacklist = new Set(this.deps.store.getFriendBlacklist(this.deps.accountId))
      const canPutBugOrWeed = this.deps.canOperate(10004) || this.deps.canOperate(10003)
      const { priority, others } = buildFriendVisitCandidates(friends, {
        myGid,
        blacklist,
        helpOn,
        stealOn,
        badOn,
        canPutBugOrWeed
      })
      const toVisit = [...this.deps.shuffleOrder(priority), ...this.deps.shuffleOrder(others)]
      if (!toVisit.length)
        return false

      const totalActions: Record<string, number> = { steal: 0, water: 0, weed: 0, bug: 0, putBug: 0, putWeed: 0 }
      let exhaustedOperations = false
      for await (const batch of this.deps.friendBatches(toVisit)) {
        for (const friend of batch) {
          if (!friend.isPriority && !helpOn && !stealOn && !this.deps.canOperate(10004) && !this.deps.canOperate(10003))
            exhaustedOperations = true
          if (exhaustedOperations)
            break
          if (!friend.isPriority && this.deps.shouldSkipFriendVisit())
            continue
          try {
            await this.visitFriend(friend, totalActions)
          } catch {}
        }
        if (exhaustedOperations)
          break
      }

      if (totalActions.steal > 0)
        await this.deps.sellAllFruits()

      const summary: string[] = []
      if (totalActions.steal > 0)
        summary.push(`偷${totalActions.steal}`)
      if (totalActions.weed > 0)
        summary.push(`除草${totalActions.weed}`)
      if (totalActions.bug > 0)
        summary.push(`除虫${totalActions.bug}`)
      if (totalActions.water > 0)
        summary.push(`浇水${totalActions.water}`)
      if (totalActions.putBug > 0)
        summary.push(`放虫${totalActions.putBug}`)
      if (totalActions.putWeed > 0)
        summary.push(`放草${totalActions.putWeed}`)

      if (summary.length > 0)
        this.deps.log(`巡查 ${toVisit.length} 人 → ${summary.join('/')}`, 'friend_cycle')
      return summary.length > 0
    } catch (e: any) {
      this.deps.warn(`巡查异常: ${e?.message}`, 'friend_cycle')
      return false
    }
  }
}
