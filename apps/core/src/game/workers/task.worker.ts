import type { AccountConfigService } from '../../store/account-config.service'
import type { GameConfigService } from '../game-config.service'
import type { IGameTransport } from '../interfaces/game-transport.interface'
import type { StatsTracker } from './stats.worker'
import { Logger } from '@nestjs/common'
import { Scheduler } from '@qq-farm/shared'
import { GameRpcExecutor } from '../rpc/game-rpc-executor'
import { getRewardSummary, getServerDateKey, toNum } from '../utils'

export class TaskWorker {
  private logger: Logger
  private checking = false
  private taskClaimDoneDateKey = ''
  private taskClaimLastAt = 0
  private scheduler: Scheduler
  private readonly rpc: GameRpcExecutor
  onLog: ((entry: { msg: string, tag?: string, meta?: Record<string, string>, isWarn?: boolean }) => void) | null = null

  constructor(
    private accountId: string,
    private client: IGameTransport,
    private gameConfig: GameConfigService,
    private accountConfig: AccountConfigService,
    private stats: StatsTracker,
    private getBagItems: () => any[] | Promise<any[]>
  ) {
    this.logger = new Logger(`Task:${accountId}`)
    this.scheduler = new Scheduler(`task-${accountId}`, this.logger)
    this.rpc = new GameRpcExecutor(client)
  }

  private log(msg: string, event?: string) {
    this.logger.log(msg)
    this.onLog?.({ msg, tag: '任务', meta: { module: 'task', ...(event && { event }) }, isWarn: false })
  }

  private warn(msg: string, event?: string) {
    this.logger.warn(msg)
    this.onLog?.({ msg, tag: '任务', meta: { module: 'task', ...(event && { event }) }, isWarn: true })
  }

  // ========== API ==========

  async getTaskInfo(): Promise<any> {
    const { data } = await this.rpc.call('task.taskInfo', {})
    return data ?? {}
  }

  async claimTaskReward(taskId: number, doShared = false): Promise<any> {
    const { data } = await this.rpc.call('task.claimTaskReward', { id: taskId, do_shared: doShared })
    return data ?? {}
  }

  async claimDailyReward(type: number, pointIds: number[]): Promise<any> {
    const { data } = await this.rpc.call('task.claimDailyReward', { type: Number(type) || 0, point_ids: pointIds })
    return data ?? { items: [] }
  }

  async claimAllIllustratedRewards(): Promise<any> {
    const { data } = await this.rpc.call('illustrated.claimAllRewardsV2', { only_claimable: true })
    return data ?? { items: [], bonus_items: [] }
  }

  async getIllustratedState(): Promise<any> {
    const { data } = await this.rpc.call('illustrated.getIllustratedListV2', {
      // refresh=true currently returns only 101 normal entries and hides the
      // 7 treasure entries, so use the stable full response here as well.
      refresh: false,
      full: true
    })
    return data ?? {}
  }

  private hasProtoField(payload: any, fieldName: string): boolean {
    return !!payload && Object.hasOwn(payload, fieldName)
  }

  private isIllustratedRewardBoxClaimable(payload: any): boolean {
    // Live MITM samples now confirm field8 is the only reliable "claimable now"
    // bit. reward_flag can remain >0 after claim, so automation must not use it.
    if (this.hasProtoField(payload, 'reward_box_claimable_raw'))
      return !!payload?.reward_box_claimable_raw

    return false
  }

  // ========== Task Analysis ==========

  private formatTask(t: any, category = 'main') {
    return {
      id: toNum(t.id),
      desc: t.desc || `任务#${toNum(t.id)}`,
      category,
      progress: toNum(t.progress),
      totalProgress: toNum(t.total_progress),
      isClaimed: t.is_claimed,
      isUnlocked: t.is_unlocked,
      shareMultiple: toNum(t.share_multiple),
      rewards: (t.rewards || []).map((r: any) => ({ id: toNum(r.id), count: toNum(r.count) })),
      canClaim: t.is_unlocked && !t.is_claimed && toNum(t.progress) >= toNum(t.total_progress) && toNum(t.total_progress) > 0
    }
  }

  private analyzeTaskList(tasks: any[], category = 'main') {
    return tasks.map(t => this.formatTask(t, category)).filter(t => t.canClaim)
  }

  private buildDailyTasks(taskInfo: any) {
    const ti = taskInfo && typeof taskInfo === 'object' ? taskInfo : {}
    const dailyList = Array.isArray(ti.daily_tasks) ? ti.daily_tasks : []
    if (dailyList.length > 0)
      return dailyList
    return [...(ti.tasks || []), ...(ti.growth_tasks || [])].filter((t: any) => toNum(t?.task_type) === 2)
  }

  // ========== Claim Logic ==========

  private async doClaim(task: any): Promise<boolean> {
    try {
      const useShare = task.shareMultiple > 1
      const reply = await this.claimTaskReward(task.id, useShare)
      const items = reply.items || []
      const categoryName = task.category === 'daily' ? '每日任务' : (task.category === 'growth' ? '成长任务' : '任务')
      this.log(`领取(${categoryName}): ${task.desc}${useShare ? ` (${task.shareMultiple}倍)` : ''} → ${items.length > 0 ? getRewardSummary(items, id => this.gameConfig.getItemById(id)?.name ?? `物品#${id}`) : '无'}`, 'task_claim')
      this.taskClaimDoneDateKey = getServerDateKey()
      this.taskClaimLastAt = Date.now()
      this.stats.recordOperation('taskClaim', 1)
      return true
    } catch { return false }
  }

  private async checkAndClaimActives(actives: any[]) {
    let claimed = 0
    for (const active of actives) {
      const activeType = toNum(active.type)
      const claimable = (active.rewards || []).filter((r: any) => toNum(r.status) === 2)
      if (!claimable.length)
        continue
      const pointIds = claimable.map((r: any) => toNum(r.point_id)).filter((n: number) => n > 0)
      if (!pointIds.length)
        continue
      const typeName = activeType === 1 ? '日活跃' : (activeType === 2 ? '周活跃' : `活跃${activeType}`)
      try {
        this.log(`${typeName} 发现 ${pointIds.length} 个可领取奖励`, 'task_scan')
        const reply = await this.claimDailyReward(activeType, pointIds)
        const items = reply.items || []
        if (items.length > 0)
          this.log(`${typeName} 领取: ${getRewardSummary(items, id => this.gameConfig.getItemById(id)?.name ?? `物品#${id}`)}`, 'task_claim')
        claimed += pointIds.length
      } catch (e: any) { this.warn(`${typeName} 领取失败: ${e?.message}`, 'task_claim') }
    }
    return claimed
  }

  private async checkAndClaimIllustratedRewards(): Promise<boolean> {
    try {
      const illustrated = await this.getIllustratedState()
      if (!this.isIllustratedRewardBoxClaimable(illustrated))
        return false

      const beforeTicket = await this.getTicketBalance()
      await this.claimAllIllustratedRewards()
      const afterTicket = await this.getTicketBalance()
      const gain = Math.max(0, afterTicket - beforeTicket)
      if (gain < 200)
        return false
      this.log(`图鉴宝箱领取成功: 点券${gain}`, 'illustrated_rewards')
      this.taskClaimDoneDateKey = getServerDateKey()
      this.taskClaimLastAt = Date.now()
      this.stats.recordOperation('taskClaim', 1)
      return true
    } catch { return false }
  }

  private async getTicketBalance(): Promise<number> {
    try {
      const items = await this.getBagItems()
      for (const it of (items || [])) {
        if (toNum(it?.id) === 1002)
          return Math.max(0, toNum(it?.count))
      }
      return 0
    } catch { return 0 }
  }

  // ========== Main Check ==========

  async checkAndClaimTasks() {
    if (this.checking || !this.accountConfig.isAutomationOn('task', this.accountId))
      return
    this.checking = true
    try {
      const reply = await this.getTaskInfo()
      if (!reply.task_info)
        return

      const taskInfo = reply.task_info
      const dailyAll = this.buildDailyTasks(taskInfo)
      const claimable = [
        ...this.analyzeTaskList(dailyAll, 'daily'),
        ...this.analyzeTaskList(taskInfo.growth_tasks || [], 'growth'),
        ...this.analyzeTaskList(taskInfo.tasks || [], 'main')
      ]

      if (claimable.length > 0) {
        this.log(`发现 ${claimable.length} 个可领取任务`, 'task_scan')
        for (const task of claimable) await this.doClaim(task)
      }
      await this.checkAndClaimActives(taskInfo.actives || [])
      await this.checkAndClaimIllustratedRewards()
    } catch (e: any) {
      this.warn(`检查任务失败: ${e?.message}`, 'task_scan')
    } finally {
      this.checking = false
    }
  }

  // ========== Event Handling ==========

  private onTaskInfoNotify = (taskInfo: any) => {
    if (!taskInfo || !this.accountConfig.isAutomationOn('task', this.accountId))
      return
    const claimable = [
      ...this.analyzeTaskList(taskInfo.daily_tasks || [], 'daily'),
      ...this.analyzeTaskList(taskInfo.growth_tasks || [], 'growth'),
      ...this.analyzeTaskList(taskInfo.tasks || [], 'main')
    ]
    const actives = taskInfo.actives || []
    if (!claimable.length && !actives.length)
      return
    if (claimable.length)
      this.log(`有 ${claimable.length} 个任务可领取，准备自动领取...`, 'task_claim')
    this.scheduler.setTimeoutTask('task_claim_debounce', 1000, async () => {
      if (claimable.length) {
        for (const task of claimable) await this.doClaim(task)
      }
      await this.checkAndClaimActives(actives)
      await this.checkAndClaimIllustratedRewards()
    })
  }

  // ========== Lifecycle ==========

  init() {
    this.cleanup()
    this.client.on('taskInfoNotify', this.onTaskInfoNotify)
    this.scheduler.setTimeoutTask('task_init_bootstrap', 4000, () => this.checkAndClaimTasks())
  }

  cleanup() {
    this.client.removeListener('taskInfoNotify', this.onTaskInfoNotify)
    this.scheduler.clearAll()
    this.checking = false
  }

  // ========== State for UI ==========

  getTaskClaimDailyState() {
    return { key: 'task_claim', doneToday: this.taskClaimDoneDateKey === getServerDateKey(), lastClaimAt: this.taskClaimLastAt }
  }

  async getTaskDailyStateLikeApp() {
    try {
      const reply = await this.getTaskInfo()
      const ti = reply?.task_info || {}
      const dailyAll = this.buildDailyTasks(ti)
      const completedDaily = dailyAll.filter((t: any) => {
        const p = toNum(t?.progress)
        const tp = toNum(t?.total_progress)
        return tp > 0 && p >= tp
      })
      const completedCount = Math.min(3, completedDaily.length)
      const pendingDaily = dailyAll.filter((t: any) => !!(t?.is_unlocked) && !(t?.is_claimed) && toNum(t?.total_progress) > 0)
      const dailyClaimable = this.analyzeTaskList(dailyAll, 'daily')
      return { key: 'task_claim', doneToday: completedCount >= 3, lastClaimAt: this.taskClaimLastAt, claimableCount: dailyClaimable.length, pendingCount: pendingDaily.length, completedCount, totalCount: 3 }
    } catch { return { key: 'task_claim', doneToday: false, lastClaimAt: this.taskClaimLastAt, claimableCount: 0, pendingCount: 0, completedCount: 0, totalCount: 3 } }
  }

  async getGrowthTaskStateLikeApp() {
    try {
      const reply = await this.getTaskInfo()
      const ti = reply?.task_info || {}
      const growthList = Array.isArray(ti.growth_tasks) ? ti.growth_tasks : []
      const tasks = growthList.map((t: any) => {
        const progress = Math.max(0, toNum(t?.progress))
        const totalProgress = Math.max(0, toNum(t?.total_progress))
        return { id: toNum(t?.id), desc: t?.desc || `成长任务#${toNum(t?.id)}`, progress, totalProgress, isClaimed: !!t?.is_claimed, isUnlocked: !!t?.is_unlocked, isCompleted: totalProgress > 0 && progress >= totalProgress }
      })
      const completedCount = tasks.filter((t: any) => t.isCompleted).length
      return { key: 'growth_task', doneToday: tasks.length > 0 && completedCount >= tasks.length, completedCount, totalCount: tasks.length, tasks }
    } catch { return { key: 'growth_task', doneToday: false, completedCount: 0, totalCount: 0, tasks: [] } }
  }

  destroy() {
    this.cleanup()
  }
}
