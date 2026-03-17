import { Injectable } from '@nestjs/common'
import { BehaviorResolverService } from './behavior-resolver.service'

@Injectable()
export class ActiveHoursService {
  constructor(private readonly resolver: BehaviorResolverService) {}

  isInActiveWindow(accountId: string): boolean {
    const cfg = this.resolver.getEffectiveConfig(accountId)
    if (!cfg.activeHours.enabled)
      return true

    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    for (const window of cfg.activeHours.windows) {
      const [startHour, startMinute] = window.start.split(':').map(Number)
      const [endHour, endMinute] = window.end.split(':').map(Number)
      const startMinutes = startHour * 60 + startMinute
      const endMinutes = endHour * 60 + endMinute

      if (startMinutes <= endMinutes) {
        if (currentMinutes >= startMinutes && currentMinutes <= endMinutes)
          return true
        continue
      }

      if (currentMinutes >= startMinutes || currentMinutes <= endMinutes)
        return true
    }

    return false
  }

  getQuietMode(accountId: string): 'disconnect' | 'heartbeat-only' {
    return this.resolver.getEffectiveConfig(accountId).activeHours.quietMode
  }
}
