export interface AccountRunnerActionsDeps {
  ensureReady: () => Promise<void>
  getLands: () => Promise<unknown>
  getSeeds: () => Promise<unknown>
  getBagSeeds: () => Promise<unknown>
  doFarmOp: (opType: string) => Promise<unknown>
  doSingleLandOp: (payload: { action: string, landId: number, seedId: number }) => Promise<unknown>
  getFriends: () => Promise<unknown>
  getFriendLands: (gid: number) => Promise<unknown>
  getAlmanac: (refresh?: boolean) => Promise<unknown>
  claimAlmanacRewards: () => Promise<unknown>
  doFriendOp: (gid: number, opType: string) => Promise<unknown>
  getInteractRecords: () => Promise<unknown>
  getBag: () => Promise<unknown>
  sellItem: (itemId: number, count: number) => Promise<unknown>
  buySeed: (goodsId: number, count: number, price: number) => Promise<unknown>
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

  async getSeeds() {
    await this.deps.ensureReady()
    return this.deps.getSeeds()
  }

  async getBagSeeds() {
    await this.deps.ensureReady()
    return this.deps.getBagSeeds()
  }

  async doFarmOp(opType: string) {
    await this.deps.ensureReady()
    const result = await this.deps.doFarmOp(opType)
    await this.deps.afterOperation()
    return result
  }

  async doSingleLandOp(payload: { action: string, landId: number, seedId: number }) {
    await this.deps.ensureReady()
    const result = await this.deps.doSingleLandOp(payload)
    await this.deps.afterOperation()
    return result
  }

  async getFriends() {
    await this.deps.ensureReady()
    return this.deps.getFriends()
  }

  async getFriendLands(gid: number) {
    await this.deps.ensureReady()
    return this.deps.getFriendLands(gid)
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

  async doFriendOp(gid: number, opType: string) {
    await this.deps.ensureReady()
    const result = await this.deps.doFriendOp(gid, opType)
    this.deps.pushFriends().catch(() => {})
    await this.deps.afterOperation()
    return result
  }

  async getInteractRecords() {
    await this.deps.ensureReady()
    return this.deps.getInteractRecords()
  }

  async getBag() {
    await this.deps.ensureReady()
    return this.deps.getBag()
  }

  async sellItem(itemId: number, count: number) {
    await this.deps.ensureReady()
    const result = await this.deps.sellItem(itemId, count)
    this.deps.recordSell(count)
    await this.deps.afterOperation()
    return result
  }

  async buySeed(goodsId: number, count: number, price: number) {
    await this.deps.ensureReady()
    const result = await this.deps.buySeed(goodsId, count, price)
    await this.deps.afterOperation()
    return result
  }

  getAnalytics(sortBy: string) {
    return this.deps.getAnalytics(sortBy)
  }
}
