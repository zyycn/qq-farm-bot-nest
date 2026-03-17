export interface BehaviorScriptRequestDescriptor {
  service: string
  method: string
}

export const BUILT_IN_SCRIPT_LEGACY_STEP_MS = 20
export const BUILT_IN_SCRIPT_MAX_STEP_MS = 120

export const BACKGROUND_REQUEST_SAMPLE_RANGE = {
  min: 1,
  max: 3
} as const

export const SESSION_BOOTSTRAP_REQUESTS: readonly [string, string, Record<string, unknown>][] = [
  ['gamepb.plantpb.PlantService', 'AllLands', {}],
  ['gamepb.dogpb.DogService', 'GetDogInfo', {}],
  ['gamepb.dogpb.DogService', 'GetDogFoodStatus', {}],
  ['gamepb.taskpb.TaskService', 'TaskInfo', {}],
  ['gamepb.interactpb.InteractService', 'GetInteractInfo', {}],
  ['gamepb.emailpb.EmailService', 'GetEmailList', { type: 1 }],
  ['gamepb.emailpb.EmailService', 'GetEmailList', { type: 2 }],
  ['gamepb.rechargepb.RechargeService', 'GetRechargeInfo', {}],
  ['gamepb.bulletinboardpb.BulletinBoardService', 'GetBulletinList', {}],
  ['gamepb.emailpb.EmailService', 'GetTodayClaimStatus', {}],
  ['gamepb.marqueepb.MarqueeService', 'GetMarqueeList', {}],
  ['gamepb.avatarframepb.AvatarFrameService', 'AvatarFramesOwned', {}],
  ['gamepb.userpb.UserService', 'GetUserSettings', {}],
  ['gamepb.rechargebonuspb.RechargeBonusService', 'GetRechargeBonusInfo', {}],
  ['gamepb.illustratedpb.IllustratedService', 'GetIllustratedListV2', {}],
  ['gamepb.mallpb.MallService', 'GetMallListBySlotType', {}]
] as const

export const BACKGROUND_COSMETIC_REQUESTS: readonly BehaviorScriptRequestDescriptor[] = [
  { service: 'gamepb.dogpb.DogService', method: 'GetDogInfo' },
  { service: 'gamepb.dogpb.DogService', method: 'GetDogFoodStatus' },
  { service: 'gamepb.marqueepb.MarqueeService', method: 'GetMarqueeList' },
  { service: 'gamepb.bulletinboardpb.BulletinBoardService', method: 'GetBulletinList' },
  { service: 'gamepb.avatarframepb.AvatarFrameService', method: 'AvatarFramesOwned' },
  { service: 'gamepb.userpb.UserService', method: 'GetUserSettings' },
  { service: 'gamepb.mallpb.MallService', method: 'GetMallListBySlotType' },
  { service: 'gamepb.rechargepb.RechargeService', method: 'GetRechargeInfo' },
  { service: 'gamepb.rechargebonuspb.RechargeBonusService', method: 'GetRechargeBonusInfo' },
  { service: 'gamepb.randomdroppb.RandomDropService', method: 'GetRandomDropInfo' }
] as const
