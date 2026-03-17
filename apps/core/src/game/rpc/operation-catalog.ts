import type { RequestCategory, RequestRisk } from '../../transport/interfaces/game-transport.interface'

export interface GameOperationSpec {
  service: string
  method: string
  category: RequestCategory
  risk: RequestRisk
  batchKey?: string
  allowInQuietHours?: boolean
}

export const GAME_OPERATION_CATALOG = {
  'farm.allLands': {
    service: 'gamepb.plantpb.PlantService',
    method: 'AllLands',
    category: 'farm_read',
    risk: 'low'
  },
  'farm.harvest': {
    service: 'gamepb.plantpb.PlantService',
    method: 'Harvest',
    category: 'farm_write',
    risk: 'high',
    batchKey: 'harvest'
  },
  'farm.waterLand': {
    service: 'gamepb.plantpb.PlantService',
    method: 'WaterLand',
    category: 'farm_write',
    risk: 'high'
  },
  'farm.weedOut': {
    service: 'gamepb.plantpb.PlantService',
    method: 'WeedOut',
    category: 'farm_write',
    risk: 'high'
  },
  'farm.insecticide': {
    service: 'gamepb.plantpb.PlantService',
    method: 'Insecticide',
    category: 'farm_write',
    risk: 'high'
  },
  'farm.fertilize': {
    service: 'gamepb.plantpb.PlantService',
    method: 'Fertilize',
    category: 'farm_write',
    risk: 'high',
    batchKey: 'fertilize'
  },
  'farm.removePlant': {
    service: 'gamepb.plantpb.PlantService',
    method: 'RemovePlant',
    category: 'farm_write',
    risk: 'high',
    batchKey: 'remove_plant'
  },
  'farm.upgradeLand': {
    service: 'gamepb.plantpb.PlantService',
    method: 'UpgradeLand',
    category: 'farm_write',
    risk: 'high',
    batchKey: 'upgrade_land'
  },
  'farm.unlockLand': {
    service: 'gamepb.plantpb.PlantService',
    method: 'UnlockLand',
    category: 'farm_write',
    risk: 'high',
    batchKey: 'unlock_land'
  },
  'farm.plant': {
    service: 'gamepb.plantpb.PlantService',
    method: 'Plant',
    category: 'farm_write',
    risk: 'high',
    batchKey: 'plant'
  },
  'shop.shopInfo': {
    service: 'gamepb.shoppb.ShopService',
    method: 'ShopInfo',
    category: 'farm_read',
    risk: 'low'
  },
  'shop.buyGoods': {
    service: 'gamepb.shoppb.ShopService',
    method: 'BuyGoods',
    category: 'farm_write',
    risk: 'high'
  },
  'task.taskInfo': {
    service: 'gamepb.taskpb.TaskService',
    method: 'TaskInfo',
    category: 'task_claim',
    risk: 'low'
  },
  'task.claimTaskReward': {
    service: 'gamepb.taskpb.TaskService',
    method: 'ClaimTaskReward',
    category: 'task_claim',
    risk: 'high'
  },
  'task.claimDailyReward': {
    service: 'gamepb.taskpb.TaskService',
    method: 'ClaimDailyReward',
    category: 'task_claim',
    risk: 'high'
  },
  'illustrated.claimAllRewardsV2': {
    service: 'gamepb.illustratedpb.IllustratedService',
    method: 'ClaimAllRewardsV2',
    category: 'task_claim',
    risk: 'high'
  },
  'illustrated.getIllustratedListV2': {
    service: 'gamepb.illustratedpb.IllustratedService',
    method: 'GetIllustratedListV2',
    category: 'task_claim',
    risk: 'low'
  },
  'daily.email.getEmailList': {
    service: 'gamepb.emailpb.EmailService',
    method: 'GetEmailList',
    category: 'daily_reward',
    risk: 'low'
  },
  'daily.email.batchClaimEmail': {
    service: 'gamepb.emailpb.EmailService',
    method: 'BatchClaimEmail',
    category: 'daily_reward',
    risk: 'high'
  },
  'daily.email.claimEmail': {
    service: 'gamepb.emailpb.EmailService',
    method: 'ClaimEmail',
    category: 'daily_reward',
    risk: 'high'
  },
  'daily.mall.getMonthCardInfos': {
    service: 'gamepb.mallpb.MallService',
    method: 'GetMonthCardInfos',
    category: 'daily_reward',
    risk: 'low'
  },
  'daily.mall.claimMonthCardReward': {
    service: 'gamepb.mallpb.MallService',
    method: 'ClaimMonthCardReward',
    category: 'daily_reward',
    risk: 'high'
  },
  'daily.mall.getMallListBySlotType': {
    service: 'gamepb.mallpb.MallService',
    method: 'GetMallListBySlotType',
    category: 'daily_reward',
    risk: 'low'
  },
  'daily.mall.purchase': {
    service: 'gamepb.mallpb.MallService',
    method: 'Purchase',
    category: 'daily_reward',
    risk: 'high'
  },
  'daily.redpacket.getTodayClaimStatus': {
    service: 'gamepb.redpacketpb.RedPacketService',
    method: 'GetTodayClaimStatus',
    category: 'daily_reward',
    risk: 'low'
  },
  'daily.redpacket.claimRedPacket': {
    service: 'gamepb.redpacketpb.RedPacketService',
    method: 'ClaimRedPacket',
    category: 'daily_reward',
    risk: 'high'
  },
  'daily.qqvip.getDailyGiftStatus': {
    service: 'gamepb.qqvippb.QQVipService',
    method: 'GetDailyGiftStatus',
    category: 'daily_reward',
    risk: 'low'
  },
  'daily.qqvip.claimDailyGift': {
    service: 'gamepb.qqvippb.QQVipService',
    method: 'ClaimDailyGift',
    category: 'daily_reward',
    risk: 'high'
  },
  'daily.share.checkCanShare': {
    service: 'gamepb.sharepb.ShareService',
    method: 'CheckCanShare',
    category: 'daily_reward',
    risk: 'low'
  },
  'daily.share.reportShare': {
    service: 'gamepb.sharepb.ShareService',
    method: 'ReportShare',
    category: 'daily_reward',
    risk: 'high'
  },
  'daily.share.claimShareReward': {
    service: 'gamepb.sharepb.ShareService',
    method: 'ClaimShareReward',
    category: 'daily_reward',
    risk: 'high'
  },
  'invite.reportArkClick': {
    service: 'gamepb.userpb.UserService',
    method: 'ReportArkClick',
    category: 'daily_reward',
    risk: 'high'
  },
  'warehouse.bag': {
    service: 'gamepb.itempb.ItemService',
    method: 'Bag',
    category: 'warehouse_read',
    risk: 'low'
  },
  'warehouse.sell': {
    service: 'gamepb.itempb.ItemService',
    method: 'Sell',
    category: 'warehouse_write',
    risk: 'high',
    batchKey: 'sell'
  },
  'warehouse.use': {
    service: 'gamepb.itempb.ItemService',
    method: 'Use',
    category: 'warehouse_write',
    risk: 'high',
    batchKey: 'use_item'
  },
  'warehouse.batchUse': {
    service: 'gamepb.itempb.ItemService',
    method: 'BatchUse',
    category: 'warehouse_write',
    risk: 'high',
    batchKey: 'batch_use'
  },
  'friend.syncAll': {
    service: 'gamepb.friendpb.FriendService',
    method: 'SyncAll',
    category: 'friend_visit',
    risk: 'low'
  },
  'friend.getAll': {
    service: 'gamepb.friendpb.FriendService',
    method: 'GetAll',
    category: 'friend_visit',
    risk: 'low'
  },
  'friend.getApplications': {
    service: 'gamepb.friendpb.FriendService',
    method: 'GetApplications',
    category: 'friend_visit',
    risk: 'low'
  },
  'friend.acceptFriends': {
    service: 'gamepb.friendpb.FriendService',
    method: 'AcceptFriends',
    category: 'friend_write',
    risk: 'high'
  },
  'friend.enter': {
    service: 'gamepb.visitpb.VisitService',
    method: 'Enter',
    category: 'friend_visit',
    risk: 'high'
  },
  'friend.leave': {
    service: 'gamepb.visitpb.VisitService',
    method: 'Leave',
    category: 'friend_visit',
    risk: 'high'
  },
  'friend.checkCanOperate': {
    service: 'gamepb.plantpb.PlantService',
    method: 'CheckCanOperate',
    category: 'friend_visit',
    risk: 'low'
  },
  'friend.interactRecords': {
    service: 'gamepb.interactpb.InteractService',
    method: 'InteractRecords',
    category: 'friend_visit',
    risk: 'low'
  },
  'friend.getInteractRecords': {
    service: 'gamepb.interactpb.InteractService',
    method: 'GetInteractRecords',
    category: 'friend_visit',
    risk: 'low'
  },
  'friend.visitorInteractRecords': {
    service: 'gamepb.interactpb.VisitorService',
    method: 'InteractRecords',
    category: 'friend_visit',
    risk: 'low'
  },
  'friend.visitorGetInteractRecords': {
    service: 'gamepb.interactpb.VisitorService',
    method: 'GetInteractRecords',
    category: 'friend_visit',
    risk: 'low'
  },
  'friend.harvest': {
    service: 'gamepb.plantpb.PlantService',
    method: 'Harvest',
    category: 'friend_write',
    risk: 'high'
  },
  'friend.putInsects': {
    service: 'gamepb.plantpb.PlantService',
    method: 'PutInsects',
    category: 'friend_write',
    risk: 'high'
  },
  'friend.putWeeds': {
    service: 'gamepb.plantpb.PlantService',
    method: 'PutWeeds',
    category: 'friend_write',
    risk: 'high'
  }
} as const satisfies Record<string, GameOperationSpec>

export type GameOperationKey = keyof typeof GAME_OPERATION_CATALOG
