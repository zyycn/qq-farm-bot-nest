import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as protobuf from 'protobufjs'

/** (service, method) -> [requestTypeName, replyTypeName]；Reply 多为 MethodReply，少数为 MethodResponse */
const INVOKE_TYPE_MAP: Record<string, Record<string, [string, string]>> = {
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
 * 从 INVOKE_TYPE_MAP 自动推导 (typeName -> proto 全限定名) 映射。
 * 规则：service 全名 = "gamepb.xxxpb.XxxService"，prefix = "gamepb.xxxpb"。
 */
function buildPrefixMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const [service, methods] of Object.entries(INVOKE_TYPE_MAP)) {
    // "gamepb.plantpb.PlantService" → prefix = "gamepb.plantpb"
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
const NESTED_BYTES_FIELDS: Record<string, { field: string, type: string }> = {
  'gamepb.mallpb.MallService::GetMallListBySlotType': { field: 'goods_list', type: 'MallGoods' }
}

@Injectable()
export class GameInvokeService implements OnModuleInit {
  private readonly logger = new Logger(GameInvokeService.name)
  private fullTypes: Record<string, protobuf.Type> = {}
  private nestedTypes: Record<string, protobuf.Type> = {}
  private ready = false

  async onModuleInit() {
    await this.loadFullProto()
  }

  private async loadFullProto(): Promise<void> {
    const protoDir = path.join(__dirname, '..', 'assets', 'proto')
    const root = new protobuf.Root()
    const protoFiles = fs.readdirSync(protoDir)
      .filter(name => name.endsWith('.proto'))
      .sort((a, b) => a.localeCompare(b))
      .map(name => path.join(protoDir, name))

    try {
      await root.load(protoFiles, { keepCase: true })
    } catch (e) {
      this.logger.warn(`未加载完整 proto（请确保 apps/link/assets/proto 存在）: ${(e as Error).message}`)
      this.ready = false
      return
    }

    const prefixMap = buildPrefixMap()
    const types: Record<string, protobuf.Type> = {}

    for (const [name, prefix] of prefixMap) {
      try {
        types[name] = root.lookupType(`${prefix}.${name}`)
      } catch {
        this.logger.warn(`Proto 类型未找到: ${prefix}.${name}`)
      }
    }

    this.fullTypes = types

    const nestedTypes: Record<string, protobuf.Type> = {}
    for (const [key, { type: typeName }] of Object.entries(NESTED_BYTES_FIELDS)) {
      const service = key.split('::')[0]
      const pkg = service.substring(0, service.lastIndexOf('.'))
      try {
        nestedTypes[typeName] = root.lookupType(`${pkg}.${typeName}`)
      } catch {
        this.logger.warn(`Proto 嵌套类型未找到: ${pkg}.${typeName}`)
      }
    }
    this.nestedTypes = nestedTypes

    this.ready = true
    this.logger.log('完整 proto（invoke）加载完成')
  }

  isReady(): boolean {
    return this.ready
  }

  /** 根据 (service, method) 获取请求/响应类型 */
  getTypes(service: string, method: string): { RequestType: protobuf.Type, ReplyType: protobuf.Type } | null {
    const methods = INVOKE_TYPE_MAP[service]
    if (!methods)
      return null
    const pair = methods[method]
    if (!pair)
      return null
    const [reqName, replyName] = pair
    const RequestType = this.fullTypes[reqName]
    const ReplyType = this.fullTypes[replyName]
    if (!RequestType || !ReplyType)
      return null
    return { RequestType, ReplyType }
  }

  /** 将 JSON 参数编码为 proto 请求体；fromObject 递归处理嵌套消息与 int64 转换 */
  encodeRequest(service: string, method: string, params: Record<string, unknown>): Buffer | null {
    const types = this.getTypes(service, method)
    if (!types)
      return null
    try {
      const msg = types.RequestType.fromObject(params)
      return Buffer.from(types.RequestType.encode(msg).finish())
    } catch {
      return null
    }
  }

  /** 将响应 body 解码为普通对象 */
  decodeReply(service: string, method: string, body: Buffer): unknown {
    const types = this.getTypes(service, method)
    if (!types)
      return null
    try {
      const decoded = types.ReplyType.decode(body)
      const obj = types.ReplyType.toObject(decoded, { longs: String, enums: String }) as Record<string, any>
      return this.decodeNestedBytes(service, method, obj)
    } catch {
      return null
    }
  }

  /**
   * 对含有 repeated bytes 嵌套消息的响应做二次解码。
   * 例如 GetMallListBySlotType 的 goods_list 是 repeated bytes（序列化的 MallGoods），
   * 需要逐个 decode 才能在 JSON 传输后正确读取 goods_id / is_free 等字段。
   */
  private decodeNestedBytes(service: string, method: string, obj: Record<string, any>): Record<string, any> {
    const spec = NESTED_BYTES_FIELDS[`${service}::${method}`]
    if (!spec)
      return obj
    const ProtoType = this.nestedTypes[spec.type]
    if (!ProtoType || !Array.isArray(obj[spec.field]))
      return obj
    const toObj = { longs: String, enums: String } as protobuf.IConversionOptions
    obj[spec.field] = obj[spec.field]
      .map((raw: Uint8Array | Buffer) => {
        try {
          return ProtoType.toObject(ProtoType.decode(raw), toObj)
        } catch {
          return null
        }
      })
      .filter(Boolean)
    return obj
  }
}
