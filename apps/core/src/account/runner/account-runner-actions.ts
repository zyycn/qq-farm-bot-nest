import type { GameRequestContext } from '../../game/interfaces/request-context.interface'

export interface AccountRunnerActionsDeps {
  ensureReady: () => Promise<void>
  getLands: () => Promise<unknown>
  getSeeds: (requestContext?: GameRequestContext) => Promise<unknown>
  getBagSeeds: (requestContext?: GameRequestContext) => Promise<unknown>
  doFarmOp: (opType: string, requestContext?: GameRequestContext) => Promise<unknown>
  doSingleLandOp: (payload: { action: string, landId: number, seedId: number }, requestContext?: GameRequestContext) => Promise<unknown>
  getFriends: () => Promise<unknown>
  getFriendLands: (gid: number, requestContext?: GameRequestContext) => Promise<unknown>
  getAlmanac: (refresh?: boolean) => Promise<unknown>
  claimAlmanacRewards: () => Promise<unknown>
  doFriendOp: (gid: number, opType: string, requestContext?: GameRequestContext) => Promise<unknown>
  getInteractRecords: (requestContext?: GameRequestContext) => Promise<unknown>
  getBag: () => Promise<unknown>
  sellItem: (itemId: number, count: number, requestContext?: GameRequestContext) => Promise<unknown>
  buySeed: (goodsId: number, count: number, price: number, requestContext?: GameRequestContext) => Promise<unknown>
  getAnalytics: (sortBy: string) => unknown
  recordSell: (count: number) => void
  afterOperation: () => Promise<void>
  pushFriends: () => Promise<void>
  pushAlmanac: (refresh?: boolean) => Promise<void>
}

export class AccountRunnerActions {
  constructor(private readonly deps: AccountRunnerActionsDeps) {}

  async getLands() {
    await this.deps.ensureReady()
    return this.deps.getLands()
  }

  async getSeeds(requestContext?: GameRequestContext) {
    await this.deps.ensureReady()
    return this.deps.getSeeds(requestContext)
  }

  async getBagSeeds(requestContext?: GameRequestContext) {
    await this.deps.ensureReady()
    return this.deps.getBagSeeds(requestContext)
  }

  async doFarmOp(opType: string, requestContext?: GameRequestContext) {
    await this.deps.ensureReady()
    const result = await this.deps.doFarmOp(opType, requestContext)
    await this.deps.afterOperation()
    return result
  }

  async doSingleLandOp(payload: { action: string, landId: number, seedId: number }, requestContext?: GameRequestContext) {
    await this.deps.ensureReady()
    const result = await this.deps.doSingleLandOp(payload, requestContext)
    await this.deps.afterOperation()
    return result
  }

  async getFriends() {
    await this.deps.ensureReady()
    return this.deps.getFriends()
  }

  async getFriendLands(gid: number, requestContext?: GameRequestContext) {
    await this.deps.ensureReady()
    return this.deps.getFriendLands(gid, requestContext)
  }

  async getAlmanac(refresh = false) {
    await this.deps.ensureReady()
    return this.deps.getAlmanac(refresh)
  }

  async claimAlmanacRewards() {
    await this.deps.ensureReady()
    const result = await this.deps.claimAlmanacRewards()
    this.deps.pushAlmanac(true).catch(() => {})
    await this.deps.afterOperation()
    return result
  }

  async doFriendOp(gid: number, opType: string, requestContext?: GameRequestContext) {
    await this.deps.ensureReady()
    const result = await this.deps.doFriendOp(gid, opType, requestContext)
    this.deps.pushFriends().catch(() => {})
    await this.deps.afterOperation()
    return result
  }

  async getInteractRecords(requestContext?: GameRequestContext) {
    await this.deps.ensureReady()
    return this.deps.getInteractRecords(requestContext)
  }

  async getBag() {
    await this.deps.ensureReady()
    return this.deps.getBag()
  }

  async sellItem(itemId: number, count: number, requestContext?: GameRequestContext) {
    await this.deps.ensureReady()
    const result = await this.deps.sellItem(itemId, count, requestContext)
    this.deps.recordSell(count)
    await this.deps.afterOperation()
    return result
  }

  async buySeed(goodsId: number, count: number, price: number, requestContext?: GameRequestContext) {
    await this.deps.ensureReady()
    const result = await this.deps.buySeed(goodsId, count, price, requestContext)
    await this.deps.afterOperation()
    return result
  }

  getAnalytics(sortBy: string) {
    return this.deps.getAnalytics(sortBy)
  }
}
