# QQ Farm Bot — 架构重构方案

## 进度快照（2026-03-17）

### 已落地

- `AccountManagerService` 已移除，账号管理已拆为 `AccountLifecycleService` + `AccountRegistryService` + `AccountStatusService`
- `EventEmitter2` 事件链已接入，`AccountRunner` 会发射状态/日志/数据事件，`AccountStatusService` 等处已使用 `@OnEvent`
- `RunnerScheduler`、`RunnerDaily`、`WorkerFactory` 已接入 `AccountRunner` 主流程，不再只是脚手架
- Behavior 模块已真正接线：`DelayService`、`RhythmService`、`SessionPatternService`、`SessionBootstrapService`、`BackgroundRequestService`、`ActiveHoursService` 已进入 runner / worker / action 执行链
- Device 模块已接入账号启动流程，当前按账号 `deviceProfileId` 解析设备指纹，旧的全局 `runtimeClient` 兼容链已移除
- Web 端行为配置与设备配置页面已存在，相关组件与 `localStorage` 持久化也已落地

### 仍未达标

- `AccountRunner` 虽已委托部分职责，但文件仍约 794 行，仍是核心 God Class
- `FriendWorker` 主文件仍约 903 行，拆分只完成了一部分
- Link 目录重构尚未开始，`INVOKE_TYPE_MAP` 仍内嵌，`crypto-wasm.ts` 仍缺少关键 `try/finally`
- Web API 类型化未收口，`apps/web/src/api/modules/*.ts` 和部分 store 仍保留 `Promise<any>` / `any`
- `device.setDefault` / `device.getDefault` 路由尚未补齐

### 与原方案存在偏差

- core 侧实际维护了一份 `account.events.ts`，而不是完全复用 `packages/shared/src/protocol/events.ts`
- 行为配置 UI 实现为独立 `/behavior` 页面，而非原文设想的“内嵌到策略页”

## 一、现状问题总结

### 1.1 apps/core 核心问题

| 问题 | 严重程度 | 位置 |
|------|---------|------|
| **God Class**: `AccountRunner` (约794行) — 已接入 scheduler/daily/factory，但仍混杂启动、连接恢复、登录 bootstrap、调度执行、状态推送、事件发射 | 🔴 严重 | `account/runner/account-runner.ts` |
| **巨型 Worker**: `FriendWorker` (约903行) — 已抽出 help/steal handler，但好友循环/land analysis/quiet hours/交互记录仍然混在主类中 | 🟠 较重 | `game/workers/friend/friend.worker.ts` |
| **事件常量双轨**: core 维护 `account.events.ts`，shared 也维护 `protocol/events.ts`，存在重复定义与漂移风险 | 🟠 较重 | `account/account.events.ts`, `packages/shared/src/protocol/events.ts` |
| **分散的状态管理**: 多处内存缓存(logs、runners、lands、bag), 各自实现淘汰策略 | 🟡 中等 | 多处 |
| **WebSocket handler 冗余**: 多个 handler 仍重复 `getRunnerOrThrow()` 模式 | 🟡 中等 | `realtime/handlers/` |

### 1.2 apps/link 核心问题

| 问题 | 严重程度 | 位置 |
|------|---------|------|
| **Proto 映射手工维护**: `INVOKE_TYPE_MAP` 100+ 条目，新增方法要双改 | 🟠 较重 | `game-invoke.service.ts` |
| **WASM 内存泄漏风险**: 手动 alloc/free，异常时无保护 | 🟡 中等 | `crypto-wasm.ts` |
| **rebind 竞态**: invoke 进行中 rebind 会导致响应归属错误 | 🟡 中等 | `connection-manager.service.ts` |
| **User-Agent 硬编码**: 所有账号共用一个 Windows UA，与 iOS 设备信息矛盾 | 🟠 较重 | `game-client.ts:516` |
| **DeviceInfo 不完整**: proto 定义 15 个字段，只用了 5 个 | 🟡 中等 | `game-client.ts:336-341` |

### 1.3 apps/core 类人行为问题

| 问题 | 严重程度 | 位置 |
|------|---------|------|
| **操作间隔硬编码**: `sleep(50-500ms)` 散落在 workers 中，无随机性 | 🔴 严重 | `farm-actions.ts`, `friend.worker.ts`, `warehouse-actions.ts` 等 |
| **批量操作无节奏**: 连续种植/收获/偷菜等批量操作间隔固定，机器人特征明显 | 🔴 严重 | 全局 |
| **调度间隔过于规律**: farm/friend tick 虽有 min-max 区间，但分布均匀 | 🟠 较重 | `account-runner.ts` |
| **无会话行为模式**: 真实用户有 "登录-快速操作-浏览-慢操作-退出" 的行为曲线，bot 无此模式 | 🟠 较重 | 全局 |
| **BCRF 已有随机化**: Link 层 BCRF 发送已有 3-10s 随机延迟 + 40-120s 空闲兜底 | ✅ 良好 | `game-client.ts:420-500` |

### 1.4 apps/web 核心问题

| 问题 | 严重程度 | 位置 |
|------|---------|------|
| **API 无类型**: 所有 socket 请求返回 `Promise<any>` | 🟠 较重 | `api/modules/*.ts` |
| **API 类型化未收口**: 已有 `api/types/`，但 modules/store 仍保留 `Promise<any>` / `any` | 🟠 较重 | `api/modules/*.ts`, `stores/modules/*.ts` |
| **切换账号全量重置**: 无差量加载 | 🟡 中等 | `stores/modules/account.ts` |

### 1.4 设备模拟问题 (新增需求)

**当前状态:**
- 已支持 `device_profiles` + per-account `deviceProfileId`
- `device-fingerprint.ts` 已能补全 DeviceInfo 15 个字段并生成账号级设备配置
- 设备兜底已切换为内置默认预设，不再保留全局 `runtimeClient` 作为历史 fallback
- `device.setDefault` / `device.getDefault` WebSocket 路由尚未补齐
- Link 层 UA / 设备参数虽已支持传入，但仍需继续核对与真实端参数的一致性

---

## 二、重构后目标架构

### 2.1 总体原则

- **单一职责**: 每个 service/class < 300 行
- **事件驱动**: 用 NestJS `EventEmitter2` 替代回调链
- **类型安全**: 端到端类型共享，消灭 `any`
- **可测试性**: 依赖注入，纯函数，可 mock
- **真实设备模拟**: 每账号独立设备指纹，前端可配置预设
- **类人行为**: 操作间隔随机化、批量操作节奏模拟、会话行为曲线、可配置开关

### 2.2 apps/core 重构后目录结构

```
apps/core/src/
├── main.ts
├── app.module.ts
│
├── common/                          # 不变
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   └── interceptors/
│
├── config/                          # 不变
│   ├── app.config.ts
│   └── paths.ts
│
├── database/                        # 不变
│   ├── database.module.ts
│   ├── drizzle.provider.ts
│   └── schema.ts                   # 🔄 新增 device_profiles 表
│
├── store/                           # 不变
│   ├── store.module.ts
│   └── store.service.ts
│
├── transport/                       # 🆕 从 game/ 中拆出通信层
│   ├── transport.module.ts
│   ├── link-client.service.ts       # TCP 客户端 (原 link-client.ts → NestJS 服务)
│   └── interfaces/
│       └── game-transport.interface.ts
│
├── account/                         # 🔄 重组账号管理
│   ├── account.module.ts
│   ├── account-lifecycle.service.ts # 账号启停、导入、删除
│   ├── account-registry.service.ts  # Runner 注册表
│   ├── account-status.service.ts    # 状态事件聚合 + 推送
│   ├── account.controller.ts        # REST API
│   └── runner/
│       ├── account-runner.ts        # 精简: 启动/停止 + 持有 session & workers
│       ├── runner-scheduler.ts      # 🆕 Farm/Friend 调度逻辑
│       ├── runner-daily.ts          # 🆕 每日任务定时器
│       └── worker-factory.ts        # 🆕 Worker 实例化工厂
│
├── device/                          # 🆕 设备模拟模块
│   ├── device.module.ts
│   ├── device-profile.service.ts    # 设备配置档 CRUD + 预设管理
│   ├── device-fingerprint.ts        # 设备指纹生成器 (随机 or 预设)
│   ├── device-presets.ts            # 内置设备预设数据
│   └── device.types.ts              # 设备相关类型定义
│
├── behavior/                        # 🆕 类人行为模拟模块
│   ├── behavior.module.ts
│   ├── behavior-config.service.ts   # 行为配置管理 (per-account)
│   ├── delay.service.ts             # 统一延迟服务 (替代散落的 sleep)
│   ├── rhythm.service.ts            # 操作节奏控制 (批量操作渐变)
│   ├── session-pattern.service.ts   # 会话行为曲线 (登录后行为模式)
│   ├── session-bootstrap.service.ts # 🆕 登录重入序列 (对齐真实客户端)
│   ├── background-request.service.ts # 🆕 装饰性 API 请求穿插
│   ├── active-hours.service.ts      # 🆕 活跃时段控制
│   └── behavior.types.ts            # 行为相关类型定义
│
├── game/                            # 🔄 纯游戏逻辑
│   ├── game.module.ts
│   ├── game-config.service.ts
│   ├── game-log.service.ts
│   ├── constants.ts
│   ├── types.ts
│   ├── utils.ts
│   ├── session/                     # 🔄 重命名 client-driven → session
│   │   ├── game-session.ts
│   │   ├── farm-actions.ts
│   │   ├── warehouse-actions.ts
│   │   └── state/
│   │       ├── bag-state.ts
│   │       ├── lands-state.ts
│   │       └── user-state.ts
│   └── workers/                     # 🔄 重命名 services → workers
│       ├── farm.worker.ts
│       ├── friend/                  # 🆕 拆分 FriendWorker
│       │   ├── friend.worker.ts     # 好友循环调度
│       │   ├── friend-help.ts       # 帮忙逻辑
│       │   └── friend-steal.ts      # 偷菜逻辑
│       ├── daily-rewards.worker.ts
│       ├── task.worker.ts
│       ├── illustrated.worker.ts
│       ├── analytics.worker.ts
│       ├── stats.worker.ts
│       ├── invite.worker.ts
│       └── push.worker.ts
│
├── realtime/                        # 🔄 重命名 modules/websocket → realtime
│   ├── realtime.module.ts
│   ├── realtime.gateway.ts
│   ├── realtime-push.service.ts
│   ├── emit-deduplicator.ts
│   ├── ws-router.service.ts
│   ├── ws-topics.service.ts
│   ├── ws-guards.ts
│   ├── decorators/
│   └── handlers/                    # 🔄 新增 device.handler.ts
│       ├── account.handler.ts
│       ├── behavior.handler.ts      # 🆕 行为配置 handler
│       ├── device.handler.ts        # 🆕 设备配置 handler
│       ├── farm.handler.ts
│       ├── friend.handler.ts
│       ├── warehouse.handler.ts
│       ├── shop.handler.ts
│       ├── almanac.handler.ts
│       ├── analytics.handler.ts
│       ├── strategy.handler.ts
│       ├── panel.handler.ts
│       ├── logs.handler.ts
│       └── topics.handler.ts
│
├── auth/                            # 🔄 从 modules/auth 提到顶层
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── jwt.strategy.ts
│   └── dto/
│
└── qr/                              # 🔄 从 modules/qr 提到顶层
    ├── qr.module.ts
    └── qr.controller.ts
```

### 2.3 核心拆分详解

#### AccountManagerService → 3 个服务

```
AccountManagerService (643行) 拆为:
┌─────────────────────────────┐
│ AccountLifecycleService     │ 账号 start/stop/delete/import
│ (~200行)                    │ 接收 Link 连接事件
└─────────────┬───────────────┘
              │ 事件: account.started / account.stopped
              ↓
┌─────────────────────────────┐
│ AccountRegistryService      │ runners Map 管理
│ (~80行)                     │ getRunner() / getRunnerOrThrow()
└─────────────┬───────────────┘
              │
              ↓
┌─────────────────────────────┐
│ AccountStatusService        │ 状态事件聚合
│ (~150行)                    │ 离线提醒、连接状态推送
└─────────────────────────────┘
```

#### AccountRunner → Runner + Scheduler + Daily + Factory

```
AccountRunner (676行) 拆为:
┌─────────────────────────────┐
│ AccountRunner               │ 持有 session/workers 引用
│ (~150行)                    │ start() / stop() / getStatus()
└──────┬──────────┬───────────┘
       │          │
┌──────▼────┐ ┌──▼──────────────┐
│ Scheduler │ │ RunnerDaily     │
│ (~120行)  │ │ (~100行)        │
│ farm tick │ │ 每日签到/邮件   │
│ friend tick│ │ 施肥礼物       │
└───────────┘ └─────────────────┘
                    │
              ┌─────▼────────────┐
              │ WorkerFactory    │
              │ (~80行)          │
              │ 创建所有 workers │
              └──────────────────┘
```

#### FriendWorker → 3 个文件

```
FriendWorker (1054行) 拆为:
┌──────────────────────┐
│ friend.worker.ts     │ 好友循环调度 + 限制管理 (~300行)
├──────────────────────┤
│ friend-help.ts       │ 帮忙(浇水/除虫/除草)逻辑 (~300行)
├──────────────────────┤
│ friend-steal.ts      │ 偷菜逻辑 + 黑名单过滤 (~300行)
└──────────────────────┘
```

### 2.4 回调链 → 事件驱动

**Before (回调地狱):**
```typescript
// AccountRunner 通过 callbacks 通知 AccountManagerService
this.callbacks.onStatusEvent(accountId, 'connection', data)
this.callbacks.onStopped(accountId, reason)
this.callbacks.onKicked(accountId)
```

**After (EventEmitter2):**
```typescript
// AccountRunner 发射事件
this.eventEmitter.emit('account.status', { accountId, type: 'connection', data })
this.eventEmitter.emit('account.stopped', { accountId, reason })
this.eventEmitter.emit('account.kicked', { accountId })

// AccountStatusService 监听
@OnEvent('account.status')
handleStatusEvent(payload: AccountStatusPayload) { ... }

// AccountLifecycleService 监听
@OnEvent('account.kicked')
handleKicked(payload: { accountId: string }) { ... }
```

---

## 三、设备模拟功能设计

### 3.1 完整 DeviceInfo 字段 (对齐 Proto)

根据 `userpb.proto` 的 `DeviceInfo` 定义 + WebSocket URL 参数 + HTTP Headers:

```typescript
/** 完整设备配置档 — 对齐 proto DeviceInfo 全部 15 个字段 + 连接参数 */
interface DeviceProfile {
  // === 基础标识 ===
  id: string                   // 配置档 UUID
  name: string                 // 用户自定义名称, e.g. "我的 iPhone 15 Pro"
  presetId?: string            // 来源预设 ID (如果基于预设创建)

  // === 连接参数 (WebSocket URL) ===
  serverUrl: string            // 游戏服务器 URL
  clientVersion: string        // ver 参数, e.g. "1.7.0.6_20260313"
  platform: string             // platform 参数, e.g. "qq" | "wx"
  os: string                   // os 参数, e.g. "iOS" | "android" | "windows"

  // === Proto DeviceInfo (15 字段全覆盖) ===
  sysSoftware: string          // tag 2: 系统版本, e.g. "iOS 18.3.2"
  sysHardware: string          // tag 3: 硬件信息, e.g. "iPhone15,3"
  telecomOper: string           // tag 4: 运营商, e.g. "中国移动"
  network: string              // tag 5: 网络类型, e.g. "wifi"
  screenWidth: number          // tag 6: 屏幕宽度, e.g. 1290
  screenHeight: number         // tag 7: 屏幕高度, e.g. 2796
  density: number              // tag 8: 屏幕密度, e.g. 3.0
  cpu: string                  // tag 9: CPU 标识, e.g. "arm64-v8a"
  memory: number               // tag 10: 内存 MB, e.g. 6144
  glRender: string             // tag 11: GL 渲染器, e.g. "Apple GPU"
  glVersion: string            // tag 12: GL 版本, e.g. "OpenGL ES 3.0"
  deviceId: string             // tag 13: 设备唯一标识, e.g. "iPhone15,3"
  androidOaid: string          // tag 14: Android OAID (Android 专用)
  iosCaid: string              // tag 15: iOS CAID (iOS 专用)

  // === HTTP Headers ===
  userAgent: string            // WebSocket 连接 User-Agent
  origin: string               // WebSocket Origin header
}
```

### 3.2 内置设备预设

```typescript
// device/device-presets.ts

export interface DevicePreset {
  id: string
  name: string
  category: 'ios' | 'android' | 'windows'
  profile: Omit<DeviceProfile, 'id' | 'name' | 'presetId' | 'serverUrl'>
}

export const DEVICE_PRESETS: DevicePreset[] = [
  {
    id: 'iphone-15-pro-max',
    name: 'iPhone 15 Pro Max',
    category: 'ios',
    profile: {
      clientVersion: '1.7.0.6_20260313',
      platform: 'qq',
      os: 'iOS',
      sysSoftware: 'iOS 18.3.2',
      sysHardware: 'iPhone16,2',
      telecomOper: '',
      network: 'wifi',
      screenWidth: 1290,
      screenHeight: 2796,
      density: 3.0,
      cpu: 'arm64',
      memory: 8192,
      glRender: 'Apple GPU',
      glVersion: 'OpenGL ES 3.0',
      deviceId: 'iPhone16,2',
      androidOaid: '',
      iosCaid: '',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.54(0x18003631) NetType/WIFI Language/zh_CN',
      origin: 'https://gate-obt.nqf.qq.com'
    }
  },
  {
    id: 'iphone-14',
    name: 'iPhone 14',
    category: 'ios',
    profile: {
      clientVersion: '1.7.0.6_20260313',
      platform: 'qq',
      os: 'iOS',
      sysSoftware: 'iOS 17.6.1',
      sysHardware: 'iPhone15,2',
      telecomOper: '',
      network: 'wifi',
      screenWidth: 1170,
      screenHeight: 2532,
      density: 3.0,
      cpu: 'arm64',
      memory: 6144,
      glRender: 'Apple GPU',
      glVersion: 'OpenGL ES 3.0',
      deviceId: 'iPhone15,2',
      androidOaid: '',
      iosCaid: '',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.53(0x18003530) NetType/WIFI Language/zh_CN',
      origin: 'https://gate-obt.nqf.qq.com'
    }
  },
  {
    id: 'iphone-x',
    name: 'iPhone X (当前默认)',
    category: 'ios',
    profile: {
      clientVersion: '1.7.0.6_20260313',
      platform: 'qq',
      os: 'iOS',
      sysSoftware: 'iOS 26.2.1',
      sysHardware: 'iPhone18,3',
      telecomOper: '',
      network: 'wifi',
      screenWidth: 1125,
      screenHeight: 2436,
      density: 3.0,
      cpu: 'arm64',
      memory: 7672,
      glRender: 'Apple GPU',
      glVersion: 'OpenGL ES 3.0',
      deviceId: 'iPhone X<iPhone18,3>',
      androidOaid: '',
      iosCaid: '',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.54(0x18003631) NetType/WIFI Language/zh_CN',
      origin: 'https://gate-obt.nqf.qq.com'
    }
  },
  {
    id: 'xiaomi-14-pro',
    name: '小米 14 Pro',
    category: 'android',
    profile: {
      clientVersion: '1.7.0.6_20260313',
      platform: 'qq',
      os: 'android',
      sysSoftware: 'Android 14',
      sysHardware: 'Xiaomi 2311DRK48C',
      telecomOper: '',
      network: 'wifi',
      screenWidth: 1440,
      screenHeight: 3200,
      density: 3.5,
      cpu: 'arm64-v8a',
      memory: 12288,
      glRender: 'Adreno (TM) 750',
      glVersion: 'OpenGL ES 3.2',
      deviceId: '',
      androidOaid: '',
      iosCaid: '',
      userAgent: 'Mozilla/5.0 (Linux; Android 14; 2311DRK48C Build/UKQ1.230804.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.188 Mobile Safari/537.36 MicroMessenger/8.0.54.2800(0x2800363B) NetType/WIFI Language/zh_CN',
      origin: 'https://gate-obt.nqf.qq.com'
    }
  },
  {
    id: 'samsung-s24-ultra',
    name: 'Samsung Galaxy S24 Ultra',
    category: 'android',
    profile: {
      clientVersion: '1.7.0.6_20260313',
      platform: 'qq',
      os: 'android',
      sysSoftware: 'Android 14',
      sysHardware: 'Samsung SM-S928B',
      telecomOper: '',
      network: 'wifi',
      screenWidth: 1440,
      screenHeight: 3120,
      density: 3.0,
      cpu: 'arm64-v8a',
      memory: 12288,
      glRender: 'Adreno (TM) 750',
      glVersion: 'OpenGL ES 3.2',
      deviceId: '',
      androidOaid: '',
      iosCaid: '',
      userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.188 Mobile Safari/537.36 MicroMessenger/8.0.54.2800(0x2800363B) NetType/WIFI Language/zh_CN',
      origin: 'https://gate-obt.nqf.qq.com'
    }
  },
  {
    id: 'windows-wechat',
    name: 'Windows 微信 (当前 UA)',
    category: 'windows',
    profile: {
      clientVersion: '1.7.0.6_20260313',
      platform: 'wx',
      os: 'iOS',  // 微信小程序上报为 iOS
      sysSoftware: 'Windows Unknown x64',
      sysHardware: '',
      telecomOper: '',
      network: 'wifi',
      screenWidth: 0,
      screenHeight: 0,
      density: 0,
      cpu: 'microsoft',
      memory: 7672,
      glRender: '',
      glVersion: '',
      deviceId: '',
      androidOaid: '',
      iosCaid: '',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13)',
      origin: 'https://gate-obt.nqf.qq.com'
    }
  }
]
```

### 3.3 数据存储: 全局配置 → 每账号配置

**改动方案:** `account_configs` 表新增 `device_profile_id` 字段 + 新增 `device_profiles` 表

```sql
-- 新增: 设备配置档表
CREATE TABLE device_profiles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  preset_id   TEXT,                -- 来源预设 ID
  profile     TEXT NOT NULL,       -- JSON: 完整 DeviceProfile
  created_at  INTEGER DEFAULT 0,
  updated_at  INTEGER DEFAULT 0
);

-- 修改: account_configs 新增字段
ALTER TABLE account_configs ADD COLUMN device_profile_id TEXT;
-- device_profile_id 可以是:
--   NULL         → 使用全局默认设备；若未设置，则使用内置默认预设
--   preset:xxx   → 直接使用内置预设
--   uuid         → 引用 device_profiles 表
```

### 3.4 数据流: 账号连接时设备配置的解析

```
AccountRunner.start()
  │
  ├─ deviceProfileService.resolveForAccount(accountId)
  │   ├─ 查 account_configs.device_profile_id
  │   ├─ 如果 NULL → 使用全局默认设备；若仍为空则回退到内置默认预设
  │   ├─ 如果 "preset:xxx" → 从 DEVICE_PRESETS 查找
  │   └─ 如果 UUID → 从 device_profiles 表查找
  │   └─ 返回完整 DeviceProfile
  │
  ├─ linkClient.connectAccount(accountId, code, platform, deviceProfile)
  │   │
  │   └─ TCP → Link
  │
  └─ Link 端 GameClient 使用完整 DeviceProfile:
      ├─ WebSocket URL: serverUrl + platform + os + clientVersion
      ├─ WebSocket Headers: userAgent + origin
      └─ Proto LoginRequest.device_info: 全部 15 字段
```

### 3.5 Link 端改动

#### ClientConfig 扩展 (packages/shared)

```typescript
// packages/shared/src/protocol/tcp.ts
export interface ClientConfig {
  serverUrl?: string
  clientVersion?: string
  platform?: string
  os?: string
  userAgent?: string
  origin?: string
  deviceInfo?: {
    sysSoftware?: string
    sysHardware?: string      // 🆕
    telecomOper?: string      // 🆕
    network?: string
    screenWidth?: number      // 🆕
    screenHeight?: number     // 🆕
    density?: number          // 🆕
    cpu?: string              // 🆕
    memory?: string
    glRender?: string         // 🆕
    glVersion?: string        // 🆕
    deviceId?: string
    androidOaid?: string      // 🆕
    iosCaid?: string          // 🆕
  }
}
```

#### GameClient 改动

```typescript
// game-client.ts - connect() 方法
connect(code: string, platform = 'qq'): Promise<void> {
  const url = `${this.cfg.serverUrl}?platform=${platform}&os=${this.cfg.os}&ver=${this.cfg.clientVersion}&code=${code}&openID=`

  this.ws = new WebSocket(url, {
    headers: {
      'User-Agent': this.cfg.userAgent,   // 🔄 不再硬编码
      'Origin': this.cfg.origin           // 🔄 从配置读取
    }
  })
}

// game-client.ts - sendLogin() 方法
const body = Buffer.from(t.LoginRequest.encode(t.LoginRequest.create({
  sharer_id: toLong(0),
  sharer_open_id: '',
  device_info: {
    client_version: this.cfg.clientVersion,
    sys_software: this.cfg.deviceInfo.sysSoftware,
    sys_hardware: this.cfg.deviceInfo.sysHardware,       // 🆕
    telecom_oper: this.cfg.deviceInfo.telecomOper,        // 🆕
    network: this.cfg.deviceInfo.network,
    screen_width: toLong(this.cfg.deviceInfo.screenWidth), // 🆕
    screen_height: toLong(this.cfg.deviceInfo.screenHeight), // 🆕
    density: this.cfg.deviceInfo.density,                  // 🆕
    cpu: this.cfg.deviceInfo.cpu,                          // 🆕
    memory: toLong(this.cfg.deviceInfo.memory),
    gl_render: this.cfg.deviceInfo.glRender,               // 🆕
    gl_version: this.cfg.deviceInfo.glVersion,             // 🆕
    device_id: this.cfg.deviceInfo.deviceId,
    android_oaid: this.cfg.deviceInfo.androidOaid,         // 🆕
    ios_caid: this.cfg.deviceInfo.iosCaid                  // 🆕
  }
})).finish())
```

### 3.6 前端设备管理页面

**新增路由:** `/device` (设备管理)

**页面功能:**

```
┌──────────────────────────────────────────────────────────┐
│ 设备管理                                                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─ 全局默认设备 ──────────────────────────────────────┐ │
│  │ 当前: iPhone X (当前默认)                  [修改]   │ │
│  │ 未单独配置设备的账号将使用此默认配置                │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ 设备预设库 ───────────────────────────────────────┐ │
│  │ [iOS]  [Android]  [Windows]                         │ │
│  │                                                     │ │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐            │ │
│  │ │ 📱       │ │ 📱       │ │ 📱       │            │ │
│  │ │ iPhone   │ │ iPhone   │ │ 小米     │            │ │
│  │ │ 15 Pro   │ │ 14       │ │ 14 Pro   │            │ │
│  │ │ Max      │ │          │ │          │            │ │
│  │ │ [使用]   │ │ [使用]   │ │ [使用]   │            │ │
│  │ │ [复制改] │ │ [复制改] │ │ [复制改] │            │ │
│  │ └──────────┘ └──────────┘ └──────────┘            │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ 自定义设备 ──────────────────────────────────────┐  │
│  │ [+ 新建自定义设备]  [从预设创建]                    │  │
│  │                                                     │  │
│  │ ┌─ 我的设备 1 ────────────────────── [编辑] [删除] │  │
│  │ │ iOS 18.3.2 / iPhone16,2 / wifi                  │  │
│  │ │ 使用账号: 张三、李四                             │  │
│  │ └────────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**设备编辑弹窗:**

```
┌── 编辑设备配置 ──────────────────────────────────────────┐
│                                                          │
│ 名称: [我的 iPhone 15 Pro Max          ]                │
│ 基于预设: iPhone 15 Pro Max                              │
│                                                          │
│ ── 连接参数 ──────────────────────────────────────────── │
│ 服务器地址:  [wss://gate-obt.nqf.qq.com/prod/ws    ]   │
│ 客户端版本:  [1.7.0.6_20260313                      ]   │
│ Platform:    [qq ▾]                                      │
│ OS:          [iOS ▾]                                     │
│                                                          │
│ ── 设备信息 (Proto DeviceInfo) ──────────────────────── │
│ 系统版本:     [iOS 18.3.2                           ]    │
│ 硬件型号:     [iPhone16,2                           ]    │
│ 运营商:       [                                     ]    │
│ 网络类型:     [wifi ▾]                                   │
│ 屏幕宽度:     [1290    ]  屏幕高度: [2796    ]          │
│ 屏幕密度:     [3.0     ]                                 │
│ CPU:          [arm64                                ]    │
│ 内存 (MB):    [8192    ]                                 │
│ GL 渲染器:    [Apple GPU                            ]    │
│ GL 版本:      [OpenGL ES 3.0                        ]    │
│ 设备 ID:      [iPhone16,2                           ]    │
│ Android OAID: [                                     ]    │
│ iOS CAID:     [                                     ]    │
│                                                          │
│ ── HTTP Headers ─────────────────────────────────────── │
│ User-Agent: [Mozilla/5.0 (iPhone; CPU iPhone OS...]     │
│ Origin:     [https://gate-obt.nqf.qq.com           ]    │
│                                                          │
│                              [取消]  [保存]              │
└──────────────────────────────────────────────────────────┘
```

**策略设置页增加设备选择:**

在 `views/strategy/index.vue` 的账号信息卡片中新增:

```
┌─ 设备配置 ────────────────────────────────────────────┐
│ 当前设备: [使用全局默认 ▾]                             │
│                                                        │
│ 选项:                                                  │
│   ○ 使用全局默认 (iPhone X)                           │
│   ○ iPhone 15 Pro Max (预设)                          │
│   ○ 小米 14 Pro (预设)                                │
│   ○ 我的自定义设备 1                                  │
│   ○ 我的自定义设备 2                                  │
│                                                        │
│ [管理设备 →]                                           │
└────────────────────────────────────────────────────────┘
```

### 3.7 WebSocket API 设计

```typescript
// 设备管理路由
'device.presets'           → 获取内置预设列表
'device.list'              → 获取自定义设备列表
'device.create'            → 创建自定义设备 (可基于预设)
'device.update'            → 更新自定义设备
'device.delete'            → 删除自定义设备
'device.setDefault'        → 设置全局默认设备
'device.getDefault'        → 获取全局默认设备

// 策略页增加
'strategy.update'          → 保存时包含 deviceProfileId 字段
```

---

## 四、类人行为模拟功能设计

### 4.1 现状分析: 当前硬编码延迟

| 文件 | 当前延迟 | 场景 |
|------|---------|------|
| `farm-actions.ts:105,166` | `sleep(50)` | 种植/收获每块地 |
| `farm-actions.ts:321,334` | `sleep(200)` | 施肥/除虫每块地 |
| `friend.worker.ts:240` | `sleep(200)` | 帮好友浇水/除虫 |
| `friend.worker.ts:276,291,651,850` | `sleep(100)` | 偷菜/好友操作 |
| `friend.worker.ts:953` | `sleep(200)` | 好友循环间操作 |
| `warehouse-actions.ts:163` | `sleep(300)` | 卖出物品 |
| `warehouse-actions.ts:166` | `sleep(500)` | 卖出批次间 |
| `warehouse-actions.ts:230,253` | `sleep(100)` | 仓库操作 |
| `task.worker.ts:125,148` | `sleep(300)` | 领取任务奖励 |
| `daily-rewards.worker.ts:397` | `sleep(120)` | 领取每日奖励 |
| `invite.worker.ts:98` | `INVITE_REQUEST_DELAY` | 邀请码间隔 |

**问题**: 全部为固定值，无随机性，批量操作间隔完全一致 → 机器人特征明显。

### 4.2 行为配置数据结构

```typescript
/** 类人行为配置 — 每账号独立 */
interface BehaviorConfig {
  // === 总开关 ===
  enabled: boolean              // 类人行为总开关 (关闭=使用原始固定延迟)

  // === 操作延迟 ===
  delay: {
    /** 快速批量操作 (ms): 种植/使用道具 — 真实客户端 50ms 中位数 */
    rapidBatchMin: number       // 默认: 30
    rapidBatchMax: number       // 默认: 150

    /** 等待响应型操作 (ms): 收获/购买/卖出 — 需等服务端响应 */
    actionMin: number           // 默认: 200
    actionMax: number           // 默认: 800

    /** 批量操作之间的间隔 (ms), e.g. 连续种 6 块地 */
    batchMin: number            // 默认: 500
    batchMax: number            // 默认: 2000

    /** 不同任务之间的间隔 (ms), e.g. 收完菜→种菜→施肥 */
    taskSwitchMin: number       // 默认: 1000
    taskSwitchMax: number       // 默认: 5000

    /** 好友间切换的间隔 (ms), e.g. 从好友A农场→好友B农场 */
    friendSwitchMin: number     // 默认: 2000
    friendSwitchMax: number     // 默认: 8000
  }

  // === 操作节奏 ===
  rhythm: {
    /** 批量操作速度渐变: 开始快→中间慢→结束快 */
    enableGradualPace: boolean  // 默认: true

    /** 偶发停顿: 在一系列操作中随机插入"思考"停顿 */
    enableRandomPause: boolean  // 默认: true
    pauseProbability: number    // 停顿概率 (0-1), 默认: 0.15
    pauseMin: number            // 停顿时长范围 (ms), 默认: 1000
    pauseMax: number            // 默认: 3000

    /** 操作顺序随机化: 不总是从第1块地开始种 */
    enableOrderShuffle: boolean // 默认: true
  }

  // === 会话模式 ===
  session: {
    /** 登录后冷启动延迟: 模拟真实用户打开小程序后的加载+浏览 */
    enableColdStart: boolean    // 默认: true
    coldStartMin: number        // 默认: 3000
    coldStartMax: number        // 默认: 8000

    /** 操作完成后持续在线 */
    enableLingerAfterOps: boolean // 默认: true
    lingerMin: number           // 默认: 10000
    lingerMax: number           // 默认: 60000

    /** 🆕 空闲期断开 WS: 模拟真实客户端后台化 (抓包确认: 空闲期 0 流量) */
    enableIdleDisconnect: boolean // 默认: true
    idleDisconnectMin: number    // 默认: 300000 (5min)
    idleDisconnectMax: number    // 默认: 900000 (15min)

    /** 🆕 登录后发送完整重入序列 (对齐真实客户端 15-20 个请求) */
    enableSessionBootstrap: boolean // 默认: true
  }

  // === 好友操作 ===
  friend: {
    /** 随机跳过部分好友 */
    enableRandomSkip: boolean   // 默认: false
    skipProbability: number     // 跳过概率 (0-1), 默认: 0.1

    /** 分批操作: 每 N 个好友休息一次 */
    enableBatchLimit: boolean   // 默认: true
    batchSize: number           // 默认: 10
    batchRestMin: number        // 休息时长 (ms), 默认: 5000
    batchRestMax: number        // 默认: 15000
  }

  // === 🆕 多账号去相关 ===
  multiAccount: {
    /** 启动抖动: 避免所有账号同时开始 */
    enableStartJitter: boolean    // 默认: true
    startJitterMin: number        // 默认: 5000
    startJitterMax: number        // 默认: 60000

    /** 调度错峰: farm tick 间隔加随机偏移 */
    enableScheduleOffset: boolean // 默认: true
    scheduleOffsetMin: number     // 默认: 10000
    scheduleOffsetMax: number     // 默认: 120000
  }

  // === 🆕 装饰性请求 ===
  backgroundRequests: {
    /** 穿插真实客户端会调但 bot 不调的 API */
    enabled: boolean              // 默认: true
    /** 每 N 次真实操作后插入一批装饰请求 */
    frequency: number             // 默认: 5
  }

  // === 🆕 活跃时段 ===
  activeHours: {
    /** 限制操作时段 (避免凌晨活跃) */
    enabled: boolean              // 默认: false
    windows: Array<{ start: string, end: string }>
    // 默认: [{ start: "07:00", end: "23:59" }]
    /** 静默期行为 */
    quietMode: 'disconnect' | 'heartbeat-only' // 默认: 'disconnect'
  }
}
```

### 4.3 DelayService — 统一延迟服务

替代所有散落的 `sleep(N)` 调用:

```typescript
// behavior/delay.service.ts

@Injectable()
export class DelayService {
  /**
   * 通用操作延迟 (替代 sleep(50-200))
   * 行为模式关闭时使用 fallbackMs
   */
  async action(accountId: string, fallbackMs = 100): Promise<void> {
    const cfg = this.getConfig(accountId)
    if (!cfg.enabled) return sleep(fallbackMs)
    return sleep(randomBetween(cfg.delay.actionMin, cfg.delay.actionMax))
  }

  /**
   * 批量操作间延迟 (替代 sleep(200-500))
   * index: 当前是第几个操作 (用于渐变节奏)
   * total: 总共几个操作
   */
  async batch(accountId: string, index: number, total: number, fallbackMs = 200): Promise<void> {
    const cfg = this.getConfig(accountId)
    if (!cfg.enabled) return sleep(fallbackMs)

    let delay = randomBetween(cfg.delay.batchMin, cfg.delay.batchMax)

    // 渐变节奏: U 形曲线 (开始快→中间慢→结束快)
    if (cfg.rhythm.enableGradualPace && total > 3) {
      const progress = index / (total - 1)
      const curve = 1 + 0.6 * Math.sin(progress * Math.PI) // 中间 +60%
      delay = Math.round(delay * curve)
    }

    // 随机停顿
    if (cfg.rhythm.enableRandomPause && Math.random() < cfg.pauseProbability) {
      delay += randomBetween(cfg.rhythm.pauseMin, cfg.rhythm.pauseMax)
    }

    return sleep(delay)
  }

  /** 任务切换延迟 (收菜→种菜→施肥 之间) */
  async taskSwitch(accountId: string, fallbackMs = 500): Promise<void> { ... }

  /** 好友切换延迟 (从好友A→好友B) */
  async friendSwitch(accountId: string, fallbackMs = 300): Promise<void> { ... }

  /** 冷启动延迟 (登录后第一次操作前) */
  async coldStart(accountId: string): Promise<void> { ... }

  /** 操作完毕后徘徊 (保持在线一段时间) */
  async linger(accountId: string): Promise<void> { ... }
}
```

### 4.4 RhythmService — 操作节奏控制

```typescript
// behavior/rhythm.service.ts

@Injectable()
export class RhythmService {
  /**
   * 打乱操作顺序 (例如种地不总是从第1块开始)
   */
  shuffleOrder<T>(accountId: string, items: T[]): T[] {
    const cfg = this.getConfig(accountId)
    if (!cfg.enabled || !cfg.rhythm.enableOrderShuffle) return items
    return fisherYatesShuffle([...items])
  }

  /**
   * 好友列表分批: 每 batchSize 个好友休息一次
   */
  async* friendBatches<T>(accountId: string, friends: T[]): AsyncGenerator<T[]> {
    const cfg = this.getConfig(accountId)
    if (!cfg.enabled || !cfg.friend.enableBatchLimit) {
      yield friends
      return
    }
    for (let i = 0; i < friends.length; i += cfg.friend.batchSize) {
      if (i > 0) {
        await sleep(randomBetween(cfg.friend.batchRestMin, cfg.friend.batchRestMax))
      }
      yield friends.slice(i, i + cfg.friend.batchSize)
    }
  }

  /**
   * 随机决定是否跳过某个好友
   */
  shouldSkipFriend(accountId: string): boolean {
    const cfg = this.getConfig(accountId)
    if (!cfg.enabled || !cfg.friend.enableRandomSkip) return false
    return Math.random() < cfg.friend.skipProbability
  }
}
```

### 4.5 SessionPatternService — 会话行为曲线

```typescript
// behavior/session-pattern.service.ts

@Injectable()
export class SessionPatternService {
  /**
   * 登录后冷启动: 在第一次自动操作前等待
   * 模拟真实用户: 打开小程序 → 等加载 → 浏览一下 → 开始操作
   */
  async applyColdStart(accountId: string): Promise<void> {
    const cfg = this.getConfig(accountId)
    if (!cfg.enabled || !cfg.session.enableColdStart) return
    const delay = randomBetween(cfg.session.coldStartMin, cfg.session.coldStartMax)
    this.logger.debug(`[${accountId}] 冷启动等待 ${delay}ms`)
    await sleep(delay)
  }

  /**
   * 操作完成后在线徘徊: 不立即进入下次调度
   * 模拟真实用户: 操作完 → 看看状态 → 过一会儿退出
   */
  async applyLinger(accountId: string): Promise<void> {
    const cfg = this.getConfig(accountId)
    if (!cfg.enabled || !cfg.session.enableLingerAfterOps) return
    const delay = randomBetween(cfg.session.lingerMin, cfg.session.lingerMax)
    this.logger.debug(`[${accountId}] 操作完毕后在线 ${delay}ms`)
    await sleep(delay)
  }
}
```

### 4.6 改造示例: farm-actions.ts

**Before:**
```typescript
// 收获所有成熟的地
for (const land of matureLands) {
  await this.harvest(land.landId)
  await sleep(50)  // 固定 50ms
}
// 种植所有空地
for (const land of emptyLands) {
  await this.plant(land.landId, seedId)
  await sleep(50)  // 固定 50ms
}
```

**After:**
```typescript
// 收获所有成熟的地
const orderedLands = this.rhythm.shuffleOrder(accountId, matureLands)  // 随机顺序
for (let i = 0; i < orderedLands.length; i++) {
  await this.harvest(orderedLands[i].landId)
  await this.delay.batch(accountId, i, orderedLands.length, 50)  // 类人节奏
}

await this.delay.taskSwitch(accountId, 500)  // 收菜→种菜 切换延迟

// 种植所有空地
for (let i = 0; i < emptyLands.length; i++) {
  await this.plant(emptyLands[i].landId, seedId)
  await this.delay.batch(accountId, i, emptyLands.length, 50)
}
```

### 4.7 改造示例: friend.worker.ts

**Before:**
```typescript
for (const friend of friendList) {
  await this.helpFriend(friend)
  await sleep(200)
  await this.stealFromFriend(friend)
  await sleep(100)
}
```

**After:**
```typescript
for await (const batch of this.rhythm.friendBatches(accountId, friendList)) {
  for (const friend of batch) {
    if (this.rhythm.shouldSkipFriend(accountId)) continue  // 随机跳过

    await this.helpFriend(friend)
    await this.delay.action(accountId, 200)

    await this.stealFromFriend(friend)
    await this.delay.action(accountId, 100)

    await this.delay.friendSwitch(accountId, 300)  // 好友间切换
  }
}
```

### 4.8 改造示例: AccountRunner 调度

**Before:**
```typescript
// farm tick
async runFarmTick() {
  await this.session.syncAndOperate()
  // 立即进入下次调度等待
}
```

**After:**
```typescript
async runFarmTick() {
  await this.sessionPattern.applyColdStart(this.accountId)  // 冷启动
  await this.session.syncAndOperate()
  await this.sessionPattern.applyLinger(this.accountId)     // 操作后徘徊
}
```

### 4.9 数据存储

在 `account_configs` 表新增 `behavior` JSON 字段:

```sql
ALTER TABLE account_configs ADD COLUMN behavior TEXT;  -- JSON: BehaviorConfig
```

默认值 = `{ enabled: true, delay: {...defaults}, rhythm: {...defaults}, session: {...defaults}, friend: {...defaults} }`

### 4.10 前端: 行为配置 UI

**在策略设置页 (`views/strategy/`) 新增行为配置卡片:**

```
┌─ 类人行为模拟 ──────────────────────────── [总开关 ●] ─┐
│                                                          │
│ ── 操作延迟 ──────────────────────────────────────────── │
│ 快速操作 (种植等):  [30]ms ~ [150]ms  ⓘ 真实客户端≈50ms│
│ 等待型操作 (收获等): [200]ms ~ [800]ms                  │
│ 批量操作间隔:  [500]ms ~ [2000]ms                       │
│ 任务切换间隔:  [1000]ms ~ [5000]ms                      │
│ 好友切换间隔:  [2000]ms ~ [8000]ms                      │
│                                                          │
│ ── 操作节奏 ──────────────────────────────────────────── │
│ [✓] 速度渐变 (开始快→中间慢→结束快)                    │
│ [✓] 随机停顿  概率: [15]%  时长: [1000]~[3000]ms       │
│ [✓] 操作顺序随机化 (不总是从第1块地开始)               │
│                                                          │
│ ── 会话模式 ──────────────────────────────────────────── │
│ [✓] 登录冷启动  [3000]~[8000]ms                        │
│ [✓] 操作后在线  [10000]~[60000]ms                      │
│ [✓] 空闲期断开连接  [5]~[15]min 无操作后断开           │
│     ⓘ 真实客户端后台化后完全断开, 无心跳               │
│ [✓] 登录重入序列  ⓘ 对齐真实客户端 15-20 个请求        │
│                                                          │
│ ── 好友操作 ──────────────────────────────────────────── │
│ [ ] 随机跳过好友  概率: [10]%                           │
│ [✓] 分批操作  每 [10] 个好友休息 [5000]~[15000]ms      │
│                                                          │
│ ── 多账号 ────────────────────────────────────────────── │
│ [✓] 启动抖动  [5]~[60]s  ⓘ 避免同IP多账号同时操作     │
│ [✓] 调度错峰  [10]~[120]s  ⓘ 各账号 farm tick 错开     │
│                                                          │
│ ── 伪装请求 ──────────────────────────────────────────── │
│ [✓] 穿插装饰性 API  每 [5] 次操作穿插一次              │
│     ⓘ 发送 DogService/Mall/Marquee 等真实客户端会调的API│
│                                                          │
│ ── 活跃时段 (可选) ──────────────────────────────────── │
│ [ ] 限制操作时段                                        │
│     时段 1: [07:00] ~ [23:59]  [+ 添加时段]            │
│     静默模式: ○断开连接  ○仅心跳                        │
│                                                          │
│ [恢复默认]                              [保存]          │
└──────────────────────────────────────────────────────────┘
```

### 4.11 WebSocket API

```typescript
// 行为配置路由 (合并到 strategy handler)
'strategy.query'     → 返回中包含 behavior 字段
'strategy.update'    → 接收 behavior 字段更新
```

无需单独 handler，行为配置作为策略配置的一部分保存。

### 4.12 抓包数据分析结论 (mitm_gate_packets_full.jsonl)

**会话总览:** 106.8 分钟, 4119 包, 1460 客户端请求, 2659 服务端响应

#### 心跳间隔

| 指标 | 值 |
|------|-----|
| 心跳总数 | 179 |
| 中位数 | **25.0s** (真实客户端核心节奏) |
| 24-26s 占比 | **78.7%** |
| 空闲期 | **完全无心跳** (WS 断开) |

#### BCRF 模式

- 总计 81 次, 中位间隔 20.0s
- **事件驱动**, 非周期性 — 在操作集群结束后 ~1.8s (中位) 触发
- 常见触发: GetIllustratedListV2 (14x), ClaimTaskReward (12x), Plant (7x)

#### 请求频率

| 阶段 | 频率 |
|------|------|
| 登录初始爆发 | 28.2 req/min |
| 正常操作 | 10-17 req/min |
| 批量种植峰值 | **51.9 req/min** |
| 空闲期 | **0 req/min** (完全断开) |

#### 操作间隔分布

| 间隔 | 占比 |
|------|------|
| < 100ms | 40.2% |
| 100-500ms | 14.5% |
| 0.5-3s | 27.2% |
| 3-30s | 17.7% |
| > 30s | 0.3% |

#### 关键发现

1. **种植是真的快**: Plant-to-Plant 中位数 **50ms** — 真实客户端批量种植就是近乎瞬时的
2. **收获较慢**: Harvest-to-Harvest 中位数 **736ms** — 需要等服务端响应
3. **会话重入**: 登录/重连后 1s 内发出 15-20 个状态刷新请求
4. **好友访问周期**: 每个好友 7-10s (Enter → 操作 → Leave)
5. **空闲期完全静默**: 真实客户端后台化后 WS 断开，无任何流量

### 4.13 你没想到但非常重要的反风控措施

以下是基于抓包分析和游戏风控常见手段补充的关键防检测措施:

#### 1. 种植延迟不能太大 — 真实客户端就是快的

**问题**: 上面的类人行为设计给种植加了 200-800ms 随机延迟，但抓包显示真实客户端 Plant-to-Plant 中位数只有 **50ms**！加太多延迟反而不像真人。

**方案**: `BehaviorConfig.delay` 需要区分操作类型:

```typescript
delay: {
  // 🆕 快速批量操作 (种植/使用道具) — 真实客户端就是快的
  rapidBatchMin: number       // 默认: 30
  rapidBatchMax: number       // 默认: 150

  // 慢速操作 (收获/卖出/需等待响应的)
  actionMin: number           // 默认: 200
  actionMax: number           // 默认: 800

  // ... 其他不变
}
```

#### 2. 会话重入序列必须对齐真实客户端

**问题**: 真实客户端登录/重连后会在 1s 内按固定顺序发出状态刷新请求。如果 bot 的请求顺序或组合不同，服务端很容易通过请求序列指纹检测。

**真实客户端重入序列 (抓包):**
```
AllLands → DogService(x2) → TaskInfo → GetInteractInfo → GetEmailList(x2)
→ GetRechargeInfo → GetBulletinList → GetTodayClaimStatus → MarqueeService
→ AvatarFramesOwned → GetUserSettings → RechargeBonusService → GetActivityInfo
→ GetIllustratedListV2 → GetMallListBySlotType
```

**方案**: 新增 `SessionBootstrapService`, 登录成功后按真实顺序发出这批请求:

```typescript
// game/session/session-bootstrap.ts
async onLoginSuccess() {
  // 按照真实客户端抓包顺序, 1s 内快速发出
  await this.invoke('PlantService', 'AllLands', {})
  await this.invoke('DogService', 'GetDogInfo', {})
  await this.invoke('DogService', 'GetDogFoodStatus', {})
  await this.invoke('TaskService', 'TaskInfo', {})
  await this.invoke('InteractService', 'GetInteractInfo', {})
  await this.invoke('EmailService', 'GetEmailList', { type: 1 })
  await this.invoke('EmailService', 'GetEmailList', { type: 2 })
  // ... 补全所有真实客户端会发的请求
  // 注意: 这些请求之间 **不加延迟**, 真实客户端就是瞬发的
}
```

#### 3. 空闲期断开连接 — 不要 7×24 保持连接

**问题**: 当前 bot 保持 WS 连接 7×24，持续发心跳。但真实客户端 **后台化后会断开 WS**，空闲期完全无流量。一个从不断开的长连接是最明显的 bot 特征。

**方案**: 新增 `IdleDisconnectStrategy`:

```typescript
interface BehaviorConfig {
  session: {
    // ... 已有字段

    /** 🆕 模拟后台化: 无操作超过阈值后断开 WS, 下次操作前重连 */
    enableIdleDisconnect: boolean  // 默认: true
    idleDisconnectMin: number      // 默认: 300000 (5min)
    idleDisconnectMax: number      // 默认: 900000 (15min)
  }
}
```

AccountRunner 在两次调度之间:
- 如果下次 farm tick 在 5-15min 后 → 断开 WS → 到时间重连 → 发送重入序列 → 执行操作
- 心跳自然在断开期间停止 (与真实客户端一致)

#### 4. 多账号时间去相关 — 避免同步操作

**问题**: 多账号同时登录，如果都在同一秒开始 farm tick，服务端能通过 IP + 时间戳关联多个账号。

**方案**: 新增 `MultiAccountJitter`:

```typescript
interface BehaviorConfig {
  multiAccount: {
    /** 🆕 多账号启动抖动: 避免所有账号同时开始操作 */
    enableStartJitter: boolean    // 默认: true
    startJitterMin: number        // 默认: 5000  (5s)
    startJitterMax: number        // 默认: 60000 (60s)

    /** 🆕 多账号调度错峰: farm tick 间隔加随机偏移 */
    enableScheduleOffset: boolean // 默认: true
    scheduleOffsetMin: number     // 默认: 10000 (10s)
    scheduleOffsetMax: number     // 默认: 120000 (2min)
  }
}
```

#### 5. 补全缺失的 API 调用 — 真实客户端调但 bot 不调的

**问题**: 真实客户端会调用很多 "无用" 的 API (DogService, MarqueeService, BulletinBoard, AvatarFrame, RechargeInfo, MallList 等), 这些是客户端 UI 渲染需要的数据。Bot 从不调用这些 → 请求集合指纹与真实客户端不同。

**方案**: 新增 `BackgroundRequestService`, 在操作间隙随机穿插这些 "装饰性" 请求:

```typescript
// behavior/background-request.service.ts

/** 真实客户端会调用但 bot 通常不调的 API */
const COSMETIC_REQUESTS = [
  { service: 'DogService', method: 'GetDogInfo' },
  { service: 'DogService', method: 'GetDogFoodStatus' },
  { service: 'MarqueeService', method: 'GetMarqueeList' },
  { service: 'BulletinBoardService', method: 'GetBulletinList' },
  { service: 'AvatarFrameService', method: 'AvatarFramesOwned' },
  { service: 'UserService', method: 'GetUserSettings' },
  { service: 'MallService', method: 'GetMallListBySlotType' },
  { service: 'RechargeService', method: 'GetRechargeInfo' },
  { service: 'RechargeBonusService', method: 'GetRechargeBonusInfo' },
  { service: 'ActivityService', method: 'GetActivityInfo' },
  { service: 'RandomDropService', method: 'GetRandomDropInfo' },
]

@Injectable()
export class BackgroundRequestService {
  /**
   * 在操作间隙随机发送 1-3 个装饰性请求
   * 模拟真实客户端 UI 渲染时拉取的数据
   */
  async sprinkle(accountId: string, transport: IGameTransport): Promise<void> {
    const cfg = this.getConfig(accountId)
    if (!cfg.enabled) return
    const count = 1 + Math.floor(Math.random() * 3)
    const selected = pickRandom(COSMETIC_REQUESTS, count)
    for (const req of selected) {
      transport.invoke(req.service, req.method, {}).catch(() => {})
      await sleep(randomBetween(20, 80))  // 真实客户端也是快速连发
    }
  }

  /**
   * 登录后的完整状态刷新 (对齐真实重入序列)
   */
  async sessionBootstrap(accountId: string, transport: IGameTransport): Promise<void> { ... }
}
```

在 `BehaviorConfig` 中:
```typescript
backgroundRequests: {
  /** 🆕 穿插装饰性请求 */
  enabled: boolean              // 默认: true
  /** 穿插频率: 每 N 次真实操作后插入一批装饰请求 */
  frequency: number             // 默认: 5 (每5次操作穿插一次)
}
```

#### 6. 活跃时段限制 — 不要凌晨 3 点种地

**问题**: 真实用户有明确的活跃时段 (早 7 点 ~ 晚 12 点)。Bot 在凌晨持续操作是极强的机器人信号。

**方案**:
```typescript
interface BehaviorConfig {
  activeHours: {
    /** 🆕 活跃时段限制 */
    enabled: boolean              // 默认: false (不强制)
    /** 允许操作的时间窗口 (24h 格式) */
    windows: Array<{ start: string, end: string }>
    // 默认: [{ start: "07:00", end: "23:59" }]

    /** 静默期行为: disconnect (断开) 或 heartbeat-only (仅心跳) */
    quietMode: 'disconnect' | 'heartbeat-only'  // 默认: disconnect
  }
}
```

#### 7. 操作结果响应依赖 — 不要盲发

**问题**: 真实客户端在某些操作上是 **等服务端响应后再发下一个** (如 Harvest 中位 736ms)。Bot 如果用 fire-and-forget 模式盲发, 时序上与真实客户端不同。

**方案**: 在 `DelayService` 中区分:

```typescript
/**
 * 等待响应型延迟: 用于必须等服务端响应的操作 (收获、购买等)
 * 延迟 = 实际响应时间 + 小随机
 */
async afterResponse(accountId: string, responseTimeMs: number): Promise<void> {
  const cfg = this.getConfig(accountId)
  if (!cfg.enabled) return
  // 真实客户端在收到响应后才发下一个, 这里额外加 50-200ms "用户反应时间"
  await sleep(randomBetween(50, 200))
}

/**
 * 盲发型操作: 用于无需等待响应的操作 (种植、使用道具等)
 * 真实客户端也是快速连发, 不等响应
 */
async rapidFire(accountId: string): Promise<void> {
  const cfg = this.getConfig(accountId)
  if (!cfg.enabled) return sleep(30)
  return sleep(randomBetween(cfg.delay.rapidBatchMin, cfg.delay.rapidBatchMax))
}
```

### 4.14 补充措施总览

| # | 措施 | 检测手段 | 必要性 |
|---|------|---------|--------|
| 1 | 种植用快速延迟 (30-150ms) | 操作时序异常检测 | 🔴 关键 |
| 2 | 对齐真实登录重入序列 | 请求序列指纹 | 🔴 关键 |
| 3 | 空闲期断开 WS | 长连接检测 / 心跳持续性分析 | 🔴 关键 |
| 4 | 多账号时间去相关 | 同 IP 多账号行为关联 | 🔴 关键 |
| 5 | 穿插装饰性 API 调用 | API 调用集合指纹 | 🟠 重要 |
| 6 | 活跃时段限制 | 异常时段活跃检测 | 🟠 重要 |
| 7 | 操作结果响应依赖 | 请求-响应时序分析 | 🟡 加分 |

### 4.15 风控对抗要点总结 (完整版)

| 维度 | 机器人特征 | 类人模拟方案 | 优先级 |
|------|-----------|-------------|--------|
| **种植间隔** | sleep(50) 固定 | 30-150ms 随机 (真实客户端就是快的!) | 🔴 |
| **收获/卖出间隔** | sleep(50-500) 固定 | 等响应 + 50-200ms 反应时间 | 🔴 |
| **登录重入序列** | 只发 AllLands | 对齐真实客户端 15-20 个请求序列 | 🔴 |
| **连接生命周期** | 7×24 保持连接 | 空闲 5-15min 后断开 WS, 操作前重连 | 🔴 |
| **多账号关联** | 所有账号同步操作 | 启动抖动 + 调度错峰 + 时间去相关 | 🔴 |
| **设备指纹** | 所有账号同一设备 | 每账号独立设备配置 (见第三节) | 🔴 |
| **User-Agent** | Windows UA + iOS 参数矛盾 | UA 与设备一致 (见第三节) | 🔴 |
| **API 调用集合** | 只调业务 API | 穿插 DogService/Marquee/Mall 等装饰请求 | 🟠 |
| **活跃时段** | 凌晨也操作 | 可配置活跃时间窗口 | 🟠 |
| **批量节奏** | 匀速不间断 | U 形渐变 + 随机停顿 | 🟠 |
| **操作顺序** | 总是 1→2→3→4→5→6 | Fisher-Yates 随机打乱 | 🟠 |
| **好友遍历** | 100% 全遍历 | 随机跳过 + 分批休息 | 🟠 |
| **会话模式** | 登录→立即操作 | 冷启动延迟 + 操作后徘徊 | 🟡 |
| **BCRF 信号** | ✅ 已有随机化 | 保持现状, 已与真实客户端接近 | ✅ |
| **心跳间隔** | 固定 25s | 保持现状 (真实客户端 78.7% 在 24-26s) | ✅ |

---

## 五、apps/link 重构

Link 架构本身比较清晰，主要改动 + 配合设备模拟:

```
apps/link/src/
├── main.ts
├── app.module.ts
├── link/
│   ├── link.module.ts
│   ├── tcp/                        # 🆕 TCP 通信独立目录
│   │   ├── tcp-server.service.ts
│   │   └── tcp-handler.service.ts  # 🆕 请求分发从 tcp-server 拆出
│   ├── connection/                 # 🆕 连接管理独立目录
│   │   ├── connection-manager.service.ts
│   │   └── game-client.ts         # 🔄 支持完整 DeviceProfile
│   ├── proto/                      # 🆕 协议处理独立目录
│   │   ├── proto-loader.service.ts
│   │   ├── game-invoke.service.ts
│   │   └── invoke-type-map.ts      # 🆕 抽出为独立配置文件
│   └── crypto/                     # 🆕 加密独立目录
│       └── crypto-wasm.ts          # 🔄 增加 try/finally 保护内存释放
```

**关键改动:**
1. `INVOKE_TYPE_MAP` 抽出为独立文件，便于维护和自动生成
2. `TcpServerService` 的请求分发逻辑抽到 `TcpHandlerService`
3. `crypto-wasm.ts` 的 `encryptBuffer` 用 try/finally 保护 WASM 内存释放
4. 按职责分子目录: `tcp/`, `connection/`, `proto/`, `crypto/`
5. `GameClient` 支持完整 DeviceProfile — 15 字段 + User-Agent + Origin

---

## 六、apps/web 重构

```
apps/web/src/
├── api/
│   ├── modules/
│   │   ├── device.ts               # 🆕 设备管理 API
│   │   └── ... (其他不变)
│   ├── services/
│   │   ├── request.ts
│   │   └── socket.ts
│   └── types/                      # 🆕 API 响应类型定义
│       ├── account.types.ts
│       ├── device.types.ts         # 🆕
│       ├── farm.types.ts
│       ├── friend.types.ts
│       ├── strategy.types.ts
│       └── index.ts
├── stores/
│   ├── modules/
│   │   ├── device.ts               # 🆕 设备 store
│   │   └── ... (其他不变)
│   └── index.ts                    # 🔄 persistence 改 localStorage
├── views/
│   ├── device/                     # 🆕 设备管理页
│   │   ├── components/
│   │   │   ├── DevicePresetCard.vue
│   │   │   ├── DeviceProfileCard.vue
│   │   │   ├── DeviceEditModal.vue
│   │   │   └── DeviceSelectDropdown.vue # 🆕 策略页复用的选择器
│   │   ├── constants.ts
│   │   └── index.vue
│   ├── strategy/
│   │   ├── components/
│   │   │   ├── BehaviorConfigCard.vue  # 🆕 类人行为配置卡片
│   │   │   ├── DeviceConfigCard.vue    # 🆕 设备选择卡片
│   │   │   └── ... (其他不变)
│   │   └── index.vue               # 🔄 集成设备选择 + 行为配置
│   └── ... (其他不变)
├── router/
│   └── routes.ts                   # 🔄 新增 /device 路由
└── layouts/
    └── constants.ts                # 🔄 侧边栏新增"设备管理"
```

---

## 七、packages/shared 增强

```
packages/shared/src/
├── index.ts
├── node.ts
├── game/
│   ├── constants.ts
│   └── user-state.ts
├── protocol/
│   ├── ws.ts
│   ├── tcp.ts                      # 🔄 ClientConfig 扩展完整字段
│   └── events.ts                   # 🆕 统一事件名常量
├── types/                          # 🆕 跨端共享类型
│   ├── account.types.ts
│   ├── device.types.ts             # 🆕 DeviceProfile, DevicePreset
│   ├── farm.types.ts
│   ├── friend.types.ts
│   ├── strategy.types.ts
│   └── index.ts
└── utils/
    ├── helpers.ts
    └── scheduler.ts
```

---

## 八、模块依赖关系 (重构后)

```
AppModule
├── ConfigModule
├── ScheduleModule
├── EventEmitterModule              # 🆕 替代回调链
├── ServeStaticModule
├── DatabaseModule
├── StoreModule (GLOBAL)
├── TransportModule (GLOBAL)        # 🆕 LinkClient 封装
│   └── LinkClientService
├── GameModule (GLOBAL)
│   ├── GameConfigService
│   └── GameLogService
├── DeviceModule                    # 🆕 设备模拟
│   └── DeviceProfileService
├── BehaviorModule (GLOBAL)         # 🆕 类人行为
│   ├── BehaviorConfigService
│   ├── DelayService
│   ├── RhythmService
│   ├── SessionPatternService
│   ├── SessionBootstrapService
│   ├── BackgroundRequestService
│   └── ActiveHoursService
├── AccountModule                   # 🔄 重组
│   ├── AccountLifecycleService
│   ├── AccountRegistryService
│   └── AccountStatusService
├── AuthModule
├── QrModule
└── RealtimeModule
    ├── RealtimeGateway
    ├── RealtimePushService
    ├── WsRouterService
    └── Handlers (13个, 含 device + behavior)
```

---

## 九、重构执行计划

### Phase 1: 基础设施 (低风险)

| 步骤 | 内容 | 影响范围 |
|------|------|---------|
| 1.1 | 引入 `@nestjs/event-emitter` | `app.module.ts` |
| 1.2 | 创建 `packages/shared/src/types/` 共享类型 (含 DeviceProfile) | `packages/shared` |
| 1.3 | 创建 `packages/shared/src/protocol/events.ts` 事件常量 | `packages/shared` |
| 1.4 | 扩展 `packages/shared/src/protocol/tcp.ts` 的 ClientConfig | `packages/shared` |
| 1.5 | 创建 `apps/web/src/api/types/` API 类型 | `apps/web` |

### Phase 2: 类人行为模块 (中等风险)

| 步骤 | 内容 | 影响范围 |
|------|------|---------|
| 2.1 | 创建 `behavior/` 模块: types, config, delay, rhythm | `apps/core/src/behavior/` |
| 2.2 | 在 `account_configs` 新增 `behavior` JSON 字段 | `database/schema.ts` |
| 2.3 | 改造所有 `sleep(N)` → `DelayService` (区分 rapidFire / afterResponse) | 全部 worker + actions |
| 2.4 | FarmActions 引入 `RhythmService` (顺序打乱 + 渐变节奏) | `farm-actions.ts` |
| 2.5 | FriendWorker 引入分批 + 随机跳过 | `friend.worker.ts` |
| 2.6 | 创建 `SessionBootstrapService` (对齐真实登录重入序列) | `behavior/` |
| 2.7 | 创建 `BackgroundRequestService` (穿插装饰性 API) | `behavior/` |
| 2.8 | AccountRunner 引入空闲断开 + 重连 + 冷启动 + 徘徊 | `account-runner.ts` |
| 2.9 | 多账号启动抖动 + 调度错峰 | `account-lifecycle.service.ts` |
| 2.10 | 创建 `ActiveHoursService` (活跃时段限制) | `behavior/` |
| 2.11 | 前端策略页新增行为配置卡片 (含所有开关) | `apps/web/src/views/strategy/` |

### Phase 3: 设备模拟功能 (中等风险)

| 步骤 | 内容 | 影响范围 |
|------|------|---------|
| 2.1 | 新增 `device_profiles` 表 + `account_configs.device_profile_id` | `database/schema.ts` |
| 2.2 | 创建 `device/` 模块: presets, service, fingerprint | `apps/core/src/device/` |
| 2.3 | 创建 `device.handler.ts` WebSocket 路由 | `realtime/handlers/` |
| 2.4 | 改造 Link `GameClient` 支持完整 DeviceProfile | `apps/link/` |
| 2.5 | 前端: 设备管理页 + 策略页设备选择 | `apps/web/` |
| 2.6 | AccountRunner 连接时解析账号级设备配置 | `account-runner.ts` |

### Phase 4: Core 拆分 (中等风险)

| 步骤 | 内容 | 影响范围 |
|------|------|---------|
| 3.1 | 拆 `LinkClient` → `TransportModule/LinkClientService` | `game/`, 新模块 |
| 3.2 | 拆 `AccountManagerService` → 3 个 service | `game/`, `account/` |
| 3.3 | 拆 `AccountRunner` → Runner + Scheduler + Daily + Factory | `account/runner/` |
| 3.4 | 拆 `FriendWorker` → 3 个文件 | `game/workers/friend/` |
| 3.5 | 回调链 → EventEmitter2 事件 | 全局 |
| 3.6 | 移动模块: `auth/`, `qr/`, `account/`, `realtime/` | 顶层目录 |
| 3.7 | 重命名: `client-driven` → `session`, `services` → `workers` | 目录 |

### Phase 5: Link 整理 (低风险)

| 步骤 | 内容 | 影响范围 |
|------|------|---------|
| 4.1 | 按职责分子目录: `tcp/`, `connection/`, `proto/`, `crypto/` | `apps/link/src/link/` |
| 4.2 | 抽出 `invoke-type-map.ts` | `proto/` |
| 4.3 | WASM 内存释放保护 | `crypto/crypto-wasm.ts` |

### Phase 6: Web 类型化 (低风险)

| 步骤 | 内容 | 影响范围 |
|------|------|---------|
| 5.1 | API module 函数加返回类型 | `api/modules/` |
| 5.2 | Store persistence → localStorage | `stores/index.ts` |

---

## 十、不改动的部分

以下经评估质量良好，不做改动:

- `database/` — Drizzle schema 清晰 (仅新增表)
- `store/StoreService` — 职责单一
- `common/` — decorators/guards/filters/interceptors 标准模式
- `config/` — 配置简洁
- `realtime/handlers/` — 11 个 handler 各自独立
- `realtime/ws-router.service.ts` — 元数据扫描路由发现机制优秀
- `packages/shared` 核心模块 — Scheduler、Protocol、Helpers 设计合理
- `apps/web` 视图层 — 组件拆分合理，composables 模式好
