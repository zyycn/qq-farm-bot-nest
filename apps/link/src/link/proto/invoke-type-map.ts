export type InvokeTypePair = [requestTypeName: string, replyTypeName: string]
export type InvokeTypeMap = Record<string, Record<string, InvokeTypePair>>

/** (service, method) -> [requestTypeName, replyTypeName]；Reply 多为 MethodReply，少数为 MethodResponse */
export const INVOKE_TYPE_MAP: InvokeTypeMap = {
  'gamepb.plantpb.PlantService': {
    AllLands: ['AllLandsRequest', 'AllLandsReply'],
    Harvest: ['HarvestRequest', 'HarvestReply'],
    WaterLand: ['WaterLandRequest', 'WaterLandReply'],
    WeedOut: ['WeedOutRequest', 'WeedOutReply'],
    Insecticide: ['InsecticideRequest', 'InsecticideReply'],
    RemovePlant: ['RemovePlantRequest', 'RemovePlantReply'],
    UpgradeLand: ['UpgradeLandRequest', 'UpgradeLandReply'],
    UnlockLand: ['UnlockLandRequest', 'UnlockLandReply'],
    Fertilize: ['FertilizeRequest', 'FertilizeReply'],
    Plant: ['PlantRequest', 'PlantReply'],
    CheckCanOperate: ['CheckCanOperateRequest', 'CheckCanOperateReply'],
    PutInsects: ['PutInsectsRequest', 'PutInsectsReply'],
    PutWeeds: ['PutWeedsRequest', 'PutWeedsReply']
  },
  'gamepb.interactpb.InteractService': {
    InteractRecords: ['InteractRecordsRequest', 'InteractRecordsReply'],
    GetInteractRecords: ['InteractRecordsRequest', 'InteractRecordsReply'],
    GetInteractInfo: ['GetInteractInfoRequest', 'GetInteractInfoReply']
  },
  'gamepb.interactpb.VisitorService': {
    InteractRecords: ['InteractRecordsRequest', 'InteractRecordsReply'],
    GetInteractRecords: ['InteractRecordsRequest', 'InteractRecordsReply']
  },
  'gamepb.shoppb.ShopService': {
    ShopProfiles: ['ShopProfilesRequest', 'ShopProfilesReply'],
    ShopInfo: ['ShopInfoRequest', 'ShopInfoReply'],
    BuyGoods: ['BuyGoodsRequest', 'BuyGoodsReply']
  },
  'gamepb.friendpb.FriendService': {
    SyncAll: ['SyncAllRequest', 'SyncAllReply'],
    GetAll: ['GetAllRequest', 'GetAllReply'],
    GetGameFriends: ['GetGameFriendsRequest', 'GetGameFriendsReply'],
    GetApplications: ['GetApplicationsRequest', 'GetApplicationsReply'],
    AcceptFriends: ['AcceptFriendsRequest', 'AcceptFriendsReply'],
    RejectFriends: ['RejectFriendsRequest', 'RejectFriendsReply'],
    SetBlockApplications: ['SetBlockApplicationsRequest', 'SetBlockApplicationsReply']
  },
  'gamepb.visitpb.VisitService': {
    Enter: ['EnterRequest', 'EnterReply'],
    Leave: ['LeaveRequest', 'LeaveReply']
  },
  'gamepb.taskpb.TaskService': {
    TaskInfo: ['TaskInfoRequest', 'TaskInfoReply'],
    ClaimTaskReward: ['ClaimTaskRewardRequest', 'ClaimTaskRewardReply'],
    BatchClaimTaskReward: ['BatchClaimTaskRewardRequest', 'BatchClaimTaskRewardReply'],
    ClaimDailyReward: ['ClaimDailyRewardRequest', 'ClaimDailyRewardReply'],
    ClientReportProgress: ['ClientReportProgressRequest', 'ClientReportProgressReply']
  },
  'gamepb.itempb.ItemService': {
    Bag: ['BagRequest', 'BagReply'],
    Sell: ['SellRequest', 'SellReply'],
    Use: ['UseRequest', 'UseReply'],
    BatchUse: ['BatchUseRequest', 'BatchUseReply'],
    CannelNew: ['CannelNewRequest', 'CannelNewReply']
  },
  'gamepb.userpb.UserService': {
    Login: ['LoginRequest', 'LoginReply'],
    Heartbeat: ['HeartbeatRequest', 'HeartbeatReply'],
    BatchClientReportFlow: ['BatchClientReportFlowRequest', 'BatchClientReportFlowReply'],
    ReportArkClick: ['ReportArkClickRequest', 'ReportArkClickReply'],
    SetDisplayInfo: ['SetDisplayInfoRequest', 'SetDisplayInfoReply'],
    GetUserSettings: ['GetUserSettingsRequest', 'GetUserSettingsReply'],
    SetQQFriendRecommendAuthorized: ['SetQQFriendRecommendAuthorizedRequest', 'SetQQFriendRecommendAuthorizedReply']
  },
  'gamepb.emailpb.EmailService': {
    GetEmailList: ['GetEmailListRequest', 'GetEmailListReply'],
    ReadEmail: ['ReadEmailRequest', 'ReadEmailReply'],
    BatchClaimEmail: ['BatchClaimEmailRequest', 'BatchClaimEmailReply'],
    ClaimEmail: ['ClaimEmailRequest', 'ClaimEmailReply']
  },
  'gamepb.mallpb.MallService': {
    GetMonthCardInfos: ['GetMonthCardInfosRequest', 'GetMonthCardInfosReply'],
    ClaimMonthCardReward: ['ClaimMonthCardRewardRequest', 'ClaimMonthCardRewardReply'],
    GetMallListBySlotType: ['GetMallListBySlotTypeRequest', 'GetMallListBySlotTypeResponse'],
    Purchase: ['PurchaseRequest', 'PurchaseResponse']
  },
  'gamepb.redpacketpb.RedPacketService': {
    GetTodayClaimStatus: ['GetTodayClaimStatusRequest', 'GetTodayClaimStatusReply'],
    ClaimRedPacket: ['ClaimRedPacketRequest', 'ClaimRedPacketReply']
  },
  'gamepb.qqvippb.QQVipService': {
    GetDailyGiftStatus: ['GetDailyGiftStatusRequest', 'GetDailyGiftStatusReply'],
    ClaimDailyGift: ['ClaimDailyGiftRequest', 'ClaimDailyGiftReply']
  },
  'gamepb.sharepb.ShareService': {
    CheckCanShare: ['CheckCanShareRequest', 'CheckCanShareReply'],
    ReportShare: ['ReportShareRequest', 'ReportShareReply'],
    GetInviteInfo: ['GetInviteInfoRequest', 'GetInviteInfoReply'],
    ClaimShareReward: ['ClaimShareRewardRequest', 'ClaimShareRewardReply']
  },
  'gamepb.paypb.PayService': {
    GetRechargeInfo: ['GetRechargeInfoRequest', 'GetRechargeInfoReply']
  },
  'gamepb.rechargebonuspb.RechargeBonusService': {
    GetConfig: ['GetConfigRequest', 'GetConfigReply']
  },
  'gamepb.dogpb.DogService': {
    GetDogInfo: ['GetDogInfoRequest', 'GetDogInfoReply'],
    GetProtectLogs: ['GetProtectLogsRequest', 'GetProtectLogsReply']
  },
  'gamepb.avatarframepb.AvatarFrameService': {
    AvatarFramesOwned: ['AvatarFramesOwnedRequest', 'AvatarFramesOwnedReply']
  },
  'gamepb.bulletinboardpb.BulletinBoardService': {
    GetBulletinList: ['GetBulletinListRequest', 'GetBulletinListReply'],
    GetBulletinDetail: ['GetBulletinDetailRequest', 'GetBulletinDetailReply']
  },
  'gamepb.marqueepb.MarqueeService': {
    GetMarquee: ['GetMarqueeRequest', 'GetMarqueeReply']
  },
  'gamepb.randomdroppb.RandomDropService': {
    GetActivityInfo: ['GetActivityInfoRequest', 'GetActivityInfoReply']
  },
  'gamepb.uicproxypb.UicprotoxyService': {
    BatchModerateText: ['BatchModerateTextRequest', 'BatchModerateTextReply']
  },
  'gamepb.guidepb.GuideService': {
    SetWeakGuideNodeComplete: ['SetWeakGuideNodeCompleteRequest', 'SetWeakGuideNodeCompleteReply'],
    ClaimWeakGuideReward: ['ClaimWeakGuideRewardRequest', 'ClaimWeakGuideRewardReply']
  },
  'gamepb.careerpb.CareerService': {
    CareerInfoGet: ['CareerInfoGetRequest', 'CareerInfoGetReply']
  },
  'gamepb.illustratedpb.IllustratedService': {
    GetIllustratedListV2: ['GetIllustratedListV2Request', 'GetIllustratedListV2Reply'],
    ClaimAllRewardsV2: ['ClaimAllRewardsV2Request', 'ClaimAllRewardsV2Reply'],
    ClearNewUnlockedFruitsV2: ['ClearNewUnlockedFruitsV2Request', 'ClearNewUnlockedFruitsV2Reply']
  }
}

/**
 * 从 INVOKE_TYPE_MAP 自动推导 (typeName -> proto 全限定名前缀) 映射。
 * 规则：service 全名 = "gamepb.xxxpb.XxxService"，prefix = "gamepb.xxxpb"。
 */
export function buildInvokeTypePrefixMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const [service, methods] of Object.entries(INVOKE_TYPE_MAP)) {
    const lastDot = service.lastIndexOf('.')
    if (lastDot < 0)
      continue
    const prefix = service.substring(0, lastDot)
    for (const [reqName, replyName] of Object.values(methods)) {
      map.set(reqName, prefix)
      map.set(replyName, prefix)
    }
  }
  return map
}

/**
 * 响应中 repeated bytes 字段需要二次解码的映射。
 * key = "service::method"，value = { field: 字段名, type: proto 类型短名 }
 */
export const NESTED_BYTES_FIELDS: Record<string, { field: string, type: string }> = {
  'gamepb.mallpb.MallService::GetMallListBySlotType': { field: 'goods_list', type: 'MallGoods' }
}
