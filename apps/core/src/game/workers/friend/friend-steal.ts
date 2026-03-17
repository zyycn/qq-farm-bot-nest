import type { GameConfigService } from '../../game-config.service'
import type { IGameTransport } from '../../interfaces/game-transport.interface'
import type { StatsTracker } from '../stats.worker'
import type { FriendWorker } from './friend.worker'

export class FriendStealHandler {
  constructor(
    private accountId: string,
    private client: IGameTransport,
    private gameConfig: GameConfigService,
    private stats: StatsTracker,
    private owner: FriendWorker
  ) {}

  // ========== Steal Action ==========

  async stealHarvest(friendGid: number, landIds: any[]): Promise<any> {
    const { data: reply } = await this.client.invoke<any>('gamepb.plantpb.PlantService', 'Harvest', { land_ids: landIds, host_gid: friendGid, is_all: true })
    if ((reply as any)?.operation_limits)
      this.owner.updateOperationLimits((reply as any).operation_limits)
    return reply ?? {}
  }

  // ========== Visit Friend: Steal Operations ==========

  async executeStealOps(
    gid: number,
    status: { stealable: number[], stealableInfo: any[] },
    totalActions: Record<string, number>,
    _sellAllFruits: () => Promise<number | void>
  ): Promise<string[]> {
    const actions: string[] = []
    if (!status.stealable.length)
      return actions

    const pre = await this.owner.checkCanOperateRemote(gid, 10008)
    if (!pre.canOperate)
      return actions

    const maxNum = pre.canStealNum > 0 ? pre.canStealNum : status.stealable.length
    const target = status.stealable.slice(0, maxNum)
    let ok = 0
    const stolenPlants: string[] = []
    try {
      await this.stealHarvest(gid, target)
      ok = target.length
      target.forEach((id: number) => {
        const info = status.stealableInfo.find((x: any) => x.landId === id)
        if (info)
          stolenPlants.push(info.name)
      })
    } catch {
      for (const landId of target) {
        try {
          await this.stealHarvest(gid, [landId])
          ok++
          const info = status.stealableInfo.find((x: any) => x.landId === landId)
          if (info)
            stolenPlants.push(info.name)
        } catch {}
        await this.owner.waitRapid(100)
      }
    }
    if (ok > 0) {
      const plantNames = [...new Set(stolenPlants)].join('/')
      actions.push(`偷${ok}${plantNames ? `(${plantNames})` : ''}`)
      totalActions.steal += ok
      this.stats.recordOperation('steal', ok)
    }
    return actions
  }

  // ========== Manual Steal Handler ==========

  buildManualStealHandler(runBatchWithFallback: (ids: number[], batchFn: (ids: number[]) => Promise<any>, singleFn: (ids: number[]) => Promise<any>) => Promise<number>, sellAllFruits: () => Promise<number | void>): Record<string, (status: any, gid: number) => Promise<any>> {
    return {
      steal: async (status, gid) => {
        if (!status.stealable.length)
          return { ok: true, opType: 'steal', count: 0, message: '没有可偷取土地' }
        const pre = await this.owner.checkCanOperateRemote(gid, 10008)
        if (!pre.canOperate)
          return { ok: true, opType: 'steal', count: 0, message: '今日偷菜次数已用完' }
        const target = status.stealable.slice(0, pre.canStealNum > 0 ? pre.canStealNum : status.stealable.length)
        const count = await runBatchWithFallback(target, ids => this.stealHarvest(gid, ids), ids => this.stealHarvest(gid, ids))
        if (count > 0) {
          this.stats.recordOperation('steal', count)
          await sellAllFruits()
        }
        return { ok: true, opType: 'steal', count, message: `偷取完成 ${count} 块` }
      }
    }
  }
}
