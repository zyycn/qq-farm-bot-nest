import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common'
import { AccountId } from '../../common/decorators/account-id.decorator'
import { AccountManagerService } from '../../game/account-manager.service'

@Controller('farm')
export class FarmController {
  constructor(private manager: AccountManagerService) {}

  @Post('operate')
  async operate(@AccountId() accountId: string, @Body('opType') opType: string) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id) throw new BadRequestException('缺少 x-account-id')
    return this.manager.getRunnerOrThrow(id).doFarmOp(opType)
  }
}

@Controller('lands')
export class LandsController {
  constructor(private manager: AccountManagerService) {}

  @Get()
  async getLands(@AccountId() accountId: string) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id) throw new BadRequestException('缺少 x-account-id')
    return this.manager.getRunnerOrThrow(id).getLands()
  }
}

@Controller('seeds')
export class SeedsController {
  constructor(private manager: AccountManagerService) {}

  @Get()
  async getSeeds(@AccountId() accountId: string) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id) throw new BadRequestException('缺少 x-account-id')
    return this.manager.getRunnerOrThrow(id).getSeeds()
  }
}

@Controller('bag')
export class BagController {
  constructor(private manager: AccountManagerService) {}

  @Get()
  async getBag(@AccountId() accountId: string) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id) throw new BadRequestException('缺少 x-account-id')
    return this.manager.getRunnerOrThrow(id).getBag()
  }
}

@Controller('daily-gifts')
export class DailyGiftsController {
  constructor(private manager: AccountManagerService) {}

  @Get()
  async getDailyGifts(@AccountId() accountId: string) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id) throw new BadRequestException('缺少 x-account-id')
    return this.manager.getRunnerOrThrow(id).getDailyGiftOverview()
  }
}
