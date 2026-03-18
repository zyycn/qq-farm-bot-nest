import { toNum } from '@/modules/game/domain/utils'

export interface FriendPlantSummary {
  stealNum: number
  dryNum: number
  weedNum: number
  insectNum: number
}

export interface FriendSummaryItem {
  gid: number
  name: string
  avatarUrl: string
  level: number
  plant: FriendPlantSummary | null
}

export interface FriendVisitCandidate {
  gid: number
  name: string
  isPriority: boolean
  stealNum?: number
  dryNum?: number
  weedNum?: number
  insectNum?: number
}

export function getFriendDisplayName(friend: any): string {
  const gid = toNum(friend?.gid)
  return String(friend?.remark || friend?.name || `GID:${gid}`).trim()
}

export function normalizeFriendSummary(friend: any): FriendSummaryItem {
  const plant = friend?.plant
  return {
    gid: toNum(friend?.gid),
    name: getFriendDisplayName(friend),
    avatarUrl: String(friend?.avatar_url || '').trim(),
    level: toNum(friend?.level),
    plant: plant
      ? {
          stealNum: toNum(plant.steal_plant_num),
          dryNum: toNum(plant.dry_num),
          weedNum: toNum(plant.weed_num),
          insectNum: toNum(plant.insect_num)
        }
      : null
  }
}

export function shouldKeepFriend(friend: any, myGid: number): boolean {
  return toNum(friend?.gid) !== myGid
    && String(friend?.name || '') !== '小小农夫'
    && String(friend?.remark || '') !== '小小农夫'
}

export function sortFriendSummaries(list: FriendSummaryItem[]): FriendSummaryItem[] {
  return [...list].sort((a, b) => {
    const byName = String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
    return byName !== 0 ? byName : (a.gid - b.gid)
  })
}

export function buildFriendVisitCandidates(
  friends: any[],
  options: {
    myGid: number
    blacklist: Set<number>
    helpOn: boolean
    stealOn: boolean
    badOn: boolean
    canPutBugOrWeed: boolean
  }
): { priority: FriendVisitCandidate[], others: FriendVisitCandidate[] } {
  const priority: FriendVisitCandidate[] = []
  const others: FriendVisitCandidate[] = []
  const visited = new Set<number>()

  for (const friend of friends) {
    const gid = toNum(friend?.gid)
    if (gid === options.myGid || visited.has(gid) || options.blacklist.has(gid))
      continue

    const name = getFriendDisplayName(friend)
    const plant = friend?.plant
    const stealNum = plant ? toNum(plant.steal_plant_num) : 0
    const dryNum = plant ? toNum(plant.dry_num) : 0
    const weedNum = plant ? toNum(plant.weed_num) : 0
    const insectNum = plant ? toNum(plant.insect_num) : 0
    const hasAction = stealNum > 0 || dryNum > 0 || weedNum > 0 || insectNum > 0

    if (hasAction) {
      priority.push({ gid, name, isPriority: true, stealNum, dryNum, weedNum, insectNum })
      visited.add(gid)
      continue
    }

    if ((options.badOn && options.canPutBugOrWeed) || options.helpOn || options.stealOn) {
      others.push({ gid, name, isPriority: false })
      visited.add(gid)
    }
  }

  priority.sort((a, b) => {
    const aSteal = Number(a.stealNum) || 0
    const bSteal = Number(b.stealNum) || 0
    if (bSteal !== aSteal)
      return bSteal - aSteal
    const aOps = (Number(a.dryNum) || 0) + (Number(a.weedNum) || 0) + (Number(a.insectNum) || 0)
    const bOps = (Number(b.dryNum) || 0) + (Number(b.weedNum) || 0) + (Number(b.insectNum) || 0)
    return bOps - aOps
  })

  return { priority, others }
}
