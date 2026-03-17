import type { GameConfigService } from '../../game-config.service'
import type { OwnedLandStatus } from '../helpers/land.helpers'
import { analyzeOwnedLands, formatOwnedLandsDetail, getCurrentPhase, getIssueAtSec, getMatureAtSec } from '../helpers/land.helpers'

export class LandsState {
  private landById = new Map<number, any>()
  private version = 0
  private derived: OwnedLandStatus | null = null
  private derivedVersion = 0
  private harvestAtSecByLandId = new Map<number, number>()
  private issueAtSecByLandId = new Map<number, { dryAt: number, weedAt: number, bugAt: number }>()

  applyFull(lands: any[]): boolean {
    this.landById.clear()
    for (const land of lands || []) {
      const id = Number(land?.id) || 0
      if (id > 0)
        this.landById.set(id, land)
    }
    this.version++
    this.recompute()
    return true
  }

  applyDelta(lands: any[]): boolean {
    const list = Array.isArray(lands) ? lands : []
    if (!list.length)
      return false
    for (const land of list) {
      const id = Number(land?.id) || 0
      if (id > 0)
        this.landById.set(id, land)
    }
    this.version++
    this.recompute()
    return true
  }

  getVersion(): number {
    return this.version
  }

  getAll(): any[] {
    return [...this.landById.values()].sort((a, b) => (Number(a?.id) || 0) - (Number(b?.id) || 0))
  }

  getDerived(gameConfig: GameConfigService) {
    if (!this.derived || this.derivedVersion !== this.version) {
      this.derived = analyzeOwnedLands(this.getAll(), gameConfig)
      this.derivedVersion = this.version
    }
    return this.derived
  }

  getHarvestTimers(): Map<number, number> {
    return new Map(this.harvestAtSecByLandId)
  }

  getIssueTimers(): Map<number, { dryAt: number, weedAt: number, bugAt: number }> {
    return new Map(this.issueAtSecByLandId)
  }

  getDetailSnapshot(gameConfig: GameConfigService) {
    return formatOwnedLandsDetail(this.getAll(), gameConfig)
  }

  private recompute() {
    this.derived = null
    this.derivedVersion = 0
    this.harvestAtSecByLandId.clear()
    this.issueAtSecByLandId.clear()

    for (const land of this.landById.values()) {
      const id = Number(land?.id) || 0
      if (id <= 0)
        continue

      const plant = land?.plant
      const phases = Array.isArray(plant?.phases) ? plant.phases : []
      if (!phases.length)
        continue

      const currentPhase = getCurrentPhase(phases)
      const matureAt = getMatureAtSec(phases)
      if (matureAt > 0)
        this.harvestAtSecByLandId.set(id, matureAt)
      if (currentPhase)
        this.issueAtSecByLandId.set(id, getIssueAtSec(plant, currentPhase))
    }
  }
}
