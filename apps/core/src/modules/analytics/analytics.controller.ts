import { Controller, Get, Query } from '@nestjs/common'
import { GameConfigService } from '../../game/game-config.service'
import { AnalyticsWorker } from '../../game/services/analytics.worker'

@Controller('analytics')
export class AnalyticsController {
  private analytics: AnalyticsWorker

  constructor(private gameConfig: GameConfigService) {
    this.analytics = new AnalyticsWorker(this.gameConfig)
  }

  @Get()
  getAnalytics(@Query('sort') sort?: string) {
    return this.analytics.getPlantRankings(sort || 'exp')
  }
}
