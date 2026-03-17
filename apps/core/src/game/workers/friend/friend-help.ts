import type { StoreService } from '../../../store/store.service'
import type { GameConfigService } from '../../game-config.service'
import type { IGameTransport } from '../../interfaces/game-transport.interface'
import type { StatsTracker } from '../stats.worker'
import type { FriendWorker } from './friend.worker'
import { toNum } from '../../utils'

export class FriendHelpHandler {
  constructor(
    private accountId: string,
    private client: IGameTransport,
    private gameConfig: GameConfigService,
    private store: StoreService,
    private stats: StatsTracker,
    private owner: FriendWorker
  ) {}

  // ========== Help Actions ==========

  private async helpAction(gid: number, landIds: any[], method: string, stopWhenExpLimit = false) {
    const beforeExp = toNum(this.client.userState?.exp)
    const { data: reply } = await this.client.invoke<any>('gamepb.plantpb.PlantService', method, { land_ids: landIds, host_gid: gid })
    if ((reply as any)?.operation_limits)
      this.owner.updateOperationLimits((reply as any).operation_limits)
    if (stopWhenExpLimit) {
      await this.owner.waitAction(200)
      const afterExp = toNum(this.client.userState?.exp)
      if (afterExp <= beforeExp)
        this.owner.autoDisableHelpByExpLimit()
    }
    return reply ?? {}
  }

  async helpWater(gid: number, landIds: any[], stopWhenExpLimit = false) {
    return this.helpAction(gid, landIds, 'WaterLand', stopWhenExpLimit)
  }

  async helpWeed(gid: number, landIds: any[], stopWhenExpLimit = false) {
    return this.helpAction(gid, landIds, 'WeedOut', stopWhenExpLimit)
  }

  async helpInsecticide(gid: number, landIds: any[], stopWhenExpLimit = false) {
    return this.helpAction(gid, landIds, 'Insecticide', stopWhenExpLimit)
  }

  // ========== Put Items (Bad Actions) ==========

  private async putPlantItems(friendGid: number, landIds: number[], method: string): Promise<number> {
    let ok = 0
    for (const landId of landIds) {
      try {
        const { data: reply } = await this.client.invoke<any>('gamepb.plantpb.PlantService', method, { land_ids: [landId], host_gid: friendGid })
        if ((reply as any)?.operation_limits)
          this.owner.updateOperationLimits((reply as any).operation_limits)
        ok++
      } catch {}
      await this.owner.waitRapid(100)
    }
    return ok
  }

  private async putPlantItemsDetailed(friendGid: number, landIds: number[], method: string) {
    let ok = 0
    const failed: { landId: number, reason: string }[] = []
    for (const landId of landIds) {
      try {
        const { data: reply } = await this.client.invoke<any>('gamepb.plantpb.PlantService', method, { land_ids: [landId], host_gid: friendGid })
        if ((reply as any)?.operation_limits)
          this.owner.updateOperationLimits((reply as any).operation_limits)
        ok++
      } catch (e: any) { failed.push({ landId, reason: e?.message || '未知错误' }) }
      await this.owner.waitRapid(100)
    }
    return { ok, failed }
  }

  async putInsects(gid: number, landIds: number[]) { return this.putPlantItems(gid, landIds, 'PutInsects') }
  async putWeeds(gid: number, landIds: number[]) { return this.putPlantItems(gid, landIds, 'PutWeeds') }
  async putInsectsDetailed(gid: number, landIds: number[]) { return this.putPlantItemsDetailed(gid, landIds, 'PutInsects') }
  async putWeedsDetailed(gid: number, landIds: number[]) { return this.putPlantItemsDetailed(gid, landIds, 'PutWeeds') }

  // ========== Batch Helpers ==========

  async runBatchWithFallback(ids: number[], batchFn: (ids: number[]) => Promise<any>, singleFn: (ids: number[]) => Promise<any>): Promise<number> {
    const target = ids.filter(Boolean)
    if (!target.length)
      return 0
    try {
      await batchFn(target)
      return target.length
    } catch {
      let ok = 0
      for (const landId of target) {
        try {
          await singleFn([landId])
          ok++
        } catch {}
        await this.owner.waitRapid(100)
      }
      return ok
    }
  }

  // ========== Visit Friend: Help Operations ==========

  async executeHelpOps(
    gid: number,
    status: { needWeed: number[], needBug: number[], needWater: number[] },
    stopWhenExpLimit: boolean,
    totalActions: Record<string, number>
  ): Promise<string[]> {
    const actions: string[] = []
    const helpOps = [
      { id: 10005, expIds: [10005, 10003], list: status.needWeed, fn: (g: number, ids: any[], s: boolean) => this.helpWeed(g, ids, s), key: 'weed', name: '草', record: 'helpWeed' },
      { id: 10006, expIds: [10006, 10002], list: status.needBug, fn: (g: number, ids: any[], s: boolean) => this.helpInsecticide(g, ids, s), key: 'bug', name: '虫', record: 'helpBug' },
      { id: 10007, expIds: [10007, 10001], list: status.needWater, fn: (g: number, ids: any[], s: boolean) => this.helpWater(g, ids, s), key: 'water', name: '水', record: 'helpWater' }
    ]
    for (const op of helpOps) {
      const allowByExp = !stopWhenExpLimit || (this.owner.canGetExpByCandidates(op.expIds) && this.owner.canGetHelpExpFlag)
      if (op.list.length > 0 && allowByExp) {
        const pre = await this.owner.checkCanOperateRemote(gid, op.id)
        if (pre.canOperate) {
          const count = await this.runBatchWithFallback(op.list, ids => op.fn(gid, ids, stopWhenExpLimit), ids => op.fn(gid, ids, stopWhenExpLimit))
          if (count > 0) {
            actions.push(`${op.name}${count}`)
            totalActions[op.key] += count
            this.stats.recordOperation(op.record, count)
          }
        }
      }
    }
    return actions
  }

  // ========== Visit Friend: Bad Operations ==========

  async executeBadOps(
    gid: number,
    status: { canPutBug: number[], canPutWeed: number[] },
    totalActions: Record<string, number>
  ): Promise<string[]> {
    const actions: string[] = []
    if (status.canPutBug.length > 0 && this.owner.canOperate(10004)) {
      const remaining = this.owner.getRemainingTimes(10004)
      const ok = await this.putInsects(gid, status.canPutBug.slice(0, remaining))
      if (ok > 0) {
        actions.push(`放虫${ok}`)
        totalActions.putBug += ok
      }
    }
    if (status.canPutWeed.length > 0 && this.owner.canOperate(10003)) {
      const remaining = this.owner.getRemainingTimes(10003)
      const ok = await this.putWeeds(gid, status.canPutWeed.slice(0, remaining))
      if (ok > 0) {
        actions.push(`放草${ok}`)
        totalActions.putWeed += ok
      }
    }
    return actions
  }

  // ========== Manual Operation Handlers ==========

  buildManualOpHandlers(): Record<string, (status: any, gid: number) => Promise<any>> {
    return {
      water: async (status, gid) => {
        if (!status.needWater.length)
          return { ok: true, opType: 'water', count: 0, message: '没有可浇水土地' }
        const pre = await this.owner.checkCanOperateRemote(gid, 10007)
        if (!pre.canOperate)
          return { ok: true, opType: 'water', count: 0, message: '今日浇水次数已用完' }
        const count = await this.runBatchWithFallback(status.needWater, ids => this.helpWater(gid, ids), ids => this.helpWater(gid, ids))
        if (count > 0)
          this.stats.recordOperation('helpWater', count)
        return { ok: true, opType: 'water', count, message: `浇水完成 ${count} 块` }
      },
      weed: async (status, gid) => {
        if (!status.needWeed.length)
          return { ok: true, opType: 'weed', count: 0, message: '没有可除草土地' }
        const pre = await this.owner.checkCanOperateRemote(gid, 10005)
        if (!pre.canOperate)
          return { ok: true, opType: 'weed', count: 0, message: '今日除草次数已用完' }
        const count = await this.runBatchWithFallback(status.needWeed, ids => this.helpWeed(gid, ids), ids => this.helpWeed(gid, ids))
        if (count > 0)
          this.stats.recordOperation('helpWeed', count)
        return { ok: true, opType: 'weed', count, message: `除草完成 ${count} 块` }
      },
      bug: async (status, gid) => {
        if (!status.needBug.length)
          return { ok: true, opType: 'bug', count: 0, message: '没有可除虫土地' }
        const pre = await this.owner.checkCanOperateRemote(gid, 10006)
        if (!pre.canOperate)
          return { ok: true, opType: 'bug', count: 0, message: '今日除虫次数已用完' }
        const count = await this.runBatchWithFallback(status.needBug, ids => this.helpInsecticide(gid, ids), ids => this.helpInsecticide(gid, ids))
        if (count > 0)
          this.stats.recordOperation('helpBug', count)
        return { ok: true, opType: 'bug', count, message: `除虫完成 ${count} 块` }
      },
      bad: async (status, gid) => {
        let bugCount = 0
        let weedCount = 0
        if (!status.canPutBug.length && !status.canPutWeed.length)
          return { ok: true, opType: 'bad', count: 0, bugCount: 0, weedCount: 0, message: '没有可捣乱土地' }
        const failDetails: string[] = []
        if (status.canPutBug.length) {
          const r = await this.putInsectsDetailed(gid, status.canPutBug)
          bugCount = r.ok
          failDetails.push(...(r.failed || []).map(f => `放虫#${f.landId}:${f.reason}`))
          if (bugCount > 0)
            this.stats.recordOperation('bug', bugCount)
        }
        if (status.canPutWeed.length) {
          const r = await this.putWeedsDetailed(gid, status.canPutWeed)
          weedCount = r.ok
          failDetails.push(...(r.failed || []).map(f => `放草#${f.landId}:${f.reason}`))
          if (weedCount > 0)
            this.stats.recordOperation('weed', weedCount)
        }
        const count = bugCount + weedCount
        if (count <= 0)
          return { ok: true, opType: 'bad', count: 0, bugCount, weedCount, message: failDetails.slice(0, 2).join(' | ') || '捣乱失败或今日次数已用完' }
        return { ok: true, opType: 'bad', count, bugCount, weedCount, message: `捣乱完成 虫${bugCount}/草${weedCount}` }
      }
    }
  }
}
