export const MODULES = [
  { label: '所有模块', value: '' },
  { label: '农场', value: 'farm' },
  { label: '好友', value: 'friend' },
  { label: '仓库', value: 'warehouse' },
  { label: '任务', value: 'task' },
  { label: '系统', value: 'system' }
]

export const EVENTS = [
  { label: '所有事件', value: '' },
  { label: '连接/登录', value: 'connect' },
  { label: '登录成功', value: 'login' },
  { label: '重连中', value: 'reconnecting' },
  { label: '被踢下线', value: 'kickout' },
  { label: '昵称同步', value: 'nick_sync' },
  { label: '调度异常', value: 'schedule_error' },
  { label: '会话执行失败', value: 'session_error' },
  { label: '设备启动摘要', value: 'device_resolution' },
  { label: '行为启动摘要', value: 'behavior_summary' },
  { label: '邀请跳过', value: 'invite_skip' },
  { label: '邀请处理', value: 'invite_process' },
  { label: '农场巡查', value: 'farm_cycle' },
  { label: '种植种子', value: 'plant_seed' },
  { label: '施加化肥', value: 'fertilize' },
  { label: '多季补肥', value: 'fertilize_multi' },
  { label: '购买种子', value: 'seed_buy' },
  { label: '远程登录', value: 'login_remote' },
  { label: '手动登录', value: 'login_manual' },
  { label: '购买化肥', value: 'fertilizer_buy' },
  { label: '开启礼包', value: 'fertilizer_gift_open' },
  { label: '获取任务', value: 'task_scan' },
  { label: '完成任务', value: 'task_claim' },
  { label: '免费礼包', value: 'mall_free_gifts' },
  { label: '分享奖励', value: 'daily_share' },
  { label: '会员礼包', value: 'vip_daily_gift' },
  { label: '月卡礼包', value: 'month_card_gift' },
  { label: '开服红包', value: 'open_server_gift' },
  { label: '图鉴奖励', value: 'illustrated_rewards' },
  { label: '邮箱领取', value: 'email_rewards' },
  { label: '出售成功', value: 'sell_success' },
  { label: '账号升级', value: 'level_up' },
  { label: '土地升级', value: 'upgrade_land' },
  { label: '土地解锁', value: 'unlock_land' },
  { label: '好友巡查', value: 'friend_cycle' },
  { label: '访问好友', value: 'visit_friend' }
]

export const LOG_LEVELS = [
  { label: '所有等级', value: '' },
  { label: '普通', value: 'info' },
  { label: '警告', value: 'warn' }
]

export const OP_META: Record<string, { label: string, icon: string }> = {
  harvest: { label: '收获', icon: 'i-streamline-emojis-cooked-rice' },
  water: { label: '浇水', icon: 'i-streamline-emojis-droplet' },
  weed: { label: '除草', icon: 'i-streamline-emojis-herb' },
  bug: { label: '除虫', icon: 'i-streamline-emojis-bug' },
  fertilize: { label: '施肥', icon: 'i-streamline-emojis-syringe' },
  plant: { label: '种植', icon: 'i-streamline-emojis-seedling' },
  upgrade: { label: '土地升级', icon: 'i-streamline-emojis-construction' },
  levelUp: { label: '账号升级', icon: 'i-streamline-emojis-sparkles' },
  steal: { label: '偷菜', icon: 'i-streamline-emojis-detective-1' },
  helpWater: { label: '帮浇水', icon: 'i-streamline-emojis-cloud-with-rain-1' },
  helpWeed: { label: '帮除草', icon: 'i-streamline-emojis-leaf-fluttering-in-wind' },
  helpBug: { label: '帮除虫', icon: 'i-streamline-emojis-lady-beetle' },
  taskClaim: { label: '任务', icon: 'i-streamline-emojis-ballot-box-with-check' },
  sell: { label: '出售', icon: 'i-streamline-emojis-dollar-banknote' }
}
