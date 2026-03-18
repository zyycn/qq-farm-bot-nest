import type { RequestCategory } from '../interfaces/game-transport.interface'

export interface GameOperationSpec {
  service: string
  method: string
  category: RequestCategory
  batchKey?: string
  allowInQuietHours?: boolean
}

export const GAME_OPERATION_CATALOG = {
  'farm.allLands': {
    service: 'gamepb.plantpb.PlantService',
    method: 'AllLands',
    category: 'farm_read'
  },
  'farm.harvest': {
    service: 'gamepb.plantpb.PlantService',
    method: 'Harvest',
    category: 'farm_write',
    batchKey: 'harvest'
  },
  'farm.waterLand': {
    service: 'gamepb.plantpb.PlantService',
    method: 'WaterLand',
    category: 'farm_write'
  },
  'farm.weedOut': {
    service: 'gamepb.plantpb.PlantService',
    method: 'WeedOut',
    category: 'farm_write'
  },
  'farm.insecticide': {
    service: 'gamepb.plantpb.PlantService',
    method: 'Insecticide',
    category: 'farm_write'
  },
  'farm.fertilize': {
    service: 'gamepb.plantpb.PlantService',
    method: 'Fertilize',
    category: 'farm_write',
    batchKey: 'fertilize'
  },
  'farm.removePlant': {
    service: 'gamepb.plantpb.PlantService',
    method: 'RemovePlant',
    category: 'farm_write',
    batchKey: 'remove_plant'
  },
  'farm.upgradeLand': {
    service: 'gamepb.plantpb.PlantService',
    method: 'UpgradeLand',
    category: 'farm_write',
    batchKey: 'upgrade_land'
  },
  'farm.unlockLand': {
    service: 'gamepb.plantpb.PlantService',
    method: 'UnlockLand',
    category: 'farm_write',
    batchKey: 'unlock_land'
  },
  'farm.plant': {
    service: 'gamepb.plantpb.PlantService',
    method: 'Plant',
    category: 'farm_write',
    batchKey: 'plant'
  },
  'shop.shopInfo': {
    service: 'gamepb.shoppb.ShopService',
    method: 'ShopInfo',
    category: 'farm_read'
  },
  'shop.buyGoods': {
    service: 'gamepb.shoppb.ShopService',
    method: 'BuyGoods',
    category: 'farm_write'
  },
  'task.taskInfo': {
    service: 'gamepb.taskpb.TaskService',
    method: 'TaskInfo',
    category: 'task_claim'
  },
  'task.claimTaskReward': {
    service: 'gamepb.taskpb.TaskService',
    method: 'ClaimTaskReward',
    category: 'task_claim'
  },
  'task.claimDailyReward': {
    service: 'gamepb.taskpb.TaskService',
    method: 'ClaimDailyReward',
    category: 'task_claim'
  },
  'illustrated.claimAllRewardsV2': {
    service: 'gamepb.illustratedpb.IllustratedService',
    method: 'ClaimAllRewardsV2',
    category: 'task_claim'
  },
  'illustrated.getIllustratedListV2': {
    service: 'gamepb.illustratedpb.IllustratedService',
    method: 'GetIllustratedListV2',
    category: 'task_claim'
  },
  'daily.email.getEmailList': {
    service: 'gamepb.emailpb.EmailService',
    method: 'GetEmailList',
    category: 'daily_reward'
  },
  'daily.email.batchClaimEmail': {
    service: 'gamepb.emailpb.EmailService',
    method: 'BatchClaimEmail',
    category: 'daily_reward'
  },
  'daily.email.claimEmail': {
    service: 'gamepb.emailpb.EmailService',
    method: 'ClaimEmail',
    category: 'daily_reward'
  },
  'daily.mall.getMonthCardInfos': {
    service: 'gamepb.mallpb.MallService',
    method: 'GetMonthCardInfos',
    category: 'daily_reward'
  },
  'daily.mall.claimMonthCardReward': {
    service: 'gamepb.mallpb.MallService',
    method: 'ClaimMonthCardReward',
    category: 'daily_reward'
  },
  'daily.mall.getMallListBySlotType': {
    service: 'gamepb.mallpb.MallService',
    method: 'GetMallListBySlotType',
    category: 'daily_reward'
  },
  'daily.mall.purchase': {
    service: 'gamepb.mallpb.MallService',
    method: 'Purchase',
    category: 'daily_reward'
  },
  'daily.redpacket.getTodayClaimStatus': {
    service: 'gamepb.redpacketpb.RedPacketService',
    method: 'GetTodayClaimStatus',
    category: 'daily_reward'
  },
  'daily.redpacket.claimRedPacket': {
    service: 'gamepb.redpacketpb.RedPacketService',
    method: 'ClaimRedPacket',
    category: 'daily_reward'
  },
  'daily.qqvip.getDailyGiftStatus': {
    service: 'gamepb.qqvippb.QQVipService',
    method: 'GetDailyGiftStatus',
    category: 'daily_reward'
  },
  'daily.qqvip.claimDailyGift': {
    service: 'gamepb.qqvippb.QQVipService',
    method: 'ClaimDailyGift',
    category: 'daily_reward'
  },
  'daily.share.checkCanShare': {
    service: 'gamepb.sharepb.ShareService',
    method: 'CheckCanShare',
    category: 'daily_reward'
  },
  'daily.share.reportShare': {
    service: 'gamepb.sharepb.ShareService',
    method: 'ReportShare',
    category: 'daily_reward'
  },
  'daily.share.claimShareReward': {
    service: 'gamepb.sharepb.ShareService',
    method: 'ClaimShareReward',
    category: 'daily_reward'
  },
  'invite.reportArkClick': {
    service: 'gamepb.userpb.UserService',
    method: 'ReportArkClick',
    category: 'daily_reward'
  },
  'warehouse.bag': {
    service: 'gamepb.itempb.ItemService',
    method: 'Bag',
    category: 'warehouse_read'
  },
  'warehouse.sell': {
    service: 'gamepb.itempb.ItemService',
    method: 'Sell',
    category: 'warehouse_write',
    batchKey: 'sell'
  },
  'warehouse.use': {
    service: 'gamepb.itempb.ItemService',
    method: 'Use',
    category: 'warehouse_write',
    batchKey: 'use_item'
  },
  'warehouse.batchUse': {
    service: 'gamepb.itempb.ItemService',
    method: 'BatchUse',
    category: 'warehouse_write',
    batchKey: 'batch_use'
  },
  'friend.syncAll': {
    service: 'gamepb.friendpb.FriendService',
    method: 'SyncAll',
    category: 'friend_visit'
  },
  'friend.getAll': {
    service: 'gamepb.friendpb.FriendService',
    method: 'GetAll',
    category: 'friend_visit'
  },
  'friend.getApplications': {
    service: 'gamepb.friendpb.FriendService',
    method: 'GetApplications',
    category: 'friend_visit'
  },
  'friend.acceptFriends': {
    service: 'gamepb.friendpb.FriendService',
    method: 'AcceptFriends',
    category: 'friend_write'
  },
  'friend.enter': {
    service: 'gamepb.visitpb.VisitService',
    method: 'Enter',
    category: 'friend_visit'
  },
  'friend.leave': {
    service: 'gamepb.visitpb.VisitService',
    method: 'Leave',
    category: 'friend_visit'
  },
  'friend.checkCanOperate': {
    service: 'gamepb.plantpb.PlantService',
    method: 'CheckCanOperate',
    category: 'friend_visit'
  },
  'friend.interactRecords': {
    service: 'gamepb.interactpb.InteractService',
    method: 'InteractRecords',
    category: 'friend_visit'
  },
  'friend.getInteractRecords': {
    service: 'gamepb.interactpb.InteractService',
    method: 'GetInteractRecords',
    category: 'friend_visit'
  },
  'friend.visitorInteractRecords': {
    service: 'gamepb.interactpb.VisitorService',
    method: 'InteractRecords',
    category: 'friend_visit'
  },
  'friend.visitorGetInteractRecords': {
    service: 'gamepb.interactpb.VisitorService',
    method: 'GetInteractRecords',
    category: 'friend_visit'
  },
  'friend.harvest': {
    service: 'gamepb.plantpb.PlantService',
    method: 'Harvest',
    category: 'friend_write'
  },
  'friend.putInsects': {
    service: 'gamepb.plantpb.PlantService',
    method: 'PutInsects',
    category: 'friend_write'
  },
  'friend.putWeeds': {
    service: 'gamepb.plantpb.PlantService',
    method: 'PutWeeds',
    category: 'friend_write'
  }
} as const satisfies Record<string, GameOperationSpec>

export type GameOperationKey = keyof typeof GAME_OPERATION_CATALOG
