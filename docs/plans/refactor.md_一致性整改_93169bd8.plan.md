---
name: REFACTOR.md 一致性整改
overview: 当前仓库已明显超出 b25c4cab 时期的“脚手架阶段”：账号模块拆分、EventEmitter2 接线、Behavior 集成、设备指纹流转、前端行为/设备页面都已落地。重型 God Class 瘦身、shared 事件常量统一、Web API 类型收口均已推进完成，剩余重点已收敛为 Link 重构与少数次级收口项；策略页内嵌方案则已确认不回退。
todos:
  - id: behavior-inject
    content: "Phase A: 将 DelayService/RhythmService 注入到所有 workers 和 actions 中，移除 16 处 else sleep(N) fallback"
    status: completed
  - id: behavior-session
    content: "Phase A: AccountRunner 登录流程集成 SessionBootstrapService + SessionPatternService (冷启动/徘徊/空闲断开)"
    status: completed
  - id: behavior-background
    content: "Phase A: 在 farm tick 中穿插 BackgroundRequestService.sprinkle() + ActiveHoursService 检查"
    status: completed
  - id: device-flow
    content: "Phase B: AccountRunner.start() 调用 resolveForAccount() 替代旧运行时兼容链，并将账号级设备配置传入 Link"
    status: completed
  - id: device-default-routes
    content: "Phase B+: 补充 device.setDefault / device.getDefault 路由，并打通前端默认设备配置流"
    status: completed
  - id: runner-delegate
    content: "Phase C: AccountRunner 委托 RunnerScheduler + RunnerDaily + WorkerFactory，删除重复的调度/创建代码"
    status: completed
  - id: manager-split
    content: "Phase C: 从 AccountManagerService 提取 AccountStatusService (状态聚合/离线提醒)"
    status: completed
  - id: event-driven
    content: "Phase D: 回调链改为 EventEmitter2 — AccountRunner 发射事件，AccountStatusService 用 @OnEvent 监听"
    status: completed
  - id: shared-event-constants-unification
    content: "Phase D+: 统一 core 与 packages/shared 的事件常量，消除 account.events.ts 与 protocol/events.ts 双轨"
    status: completed
  - id: friend-split
    content: "Phase E: FriendWorker 进一步拆分 (903行 -> ~300行)，抽取 land analysis/quiet hours/interact records"
    status: completed
  - id: web-behavior-ui
    content: "Phase F: 创建 BehaviorConfigCard.vue + DeviceConfigCard.vue + DeviceSelectDropdown.vue + 改 sessionStorage -> localStorage"
    status: completed
  - id: web-api-typing
    content: "Phase F+: 收口 apps/web/src/api/modules/*.ts 与 stores 中的 Promise<any> / any，完成 API 类型化"
    status: completed
  - id: strategy-page-embed
    content: "Phase F+: 将行为/设备配置内嵌到策略页，而不是独立 /behavior 页面"
    status: accepted_deviation
  - id: link-restructure
    content: "Phase G: Link 按职责分子目录 + crypto-wasm try/finally + 抽出 invoke-type-map.ts"
    status: completed
  - id: device-identity-hardening
    content: "专项: 收口设备模拟链路，消除账号设备配置与历史 runtimeClient / Link 默认值的隐式混合，保证最终设备来源单一且可追踪"
    status: in_progress
  - id: link-device-hardcode-cleanup
    content: "专项: 清理 Link 中与设备模拟冲突的 UA / deviceId / origin 等身份硬编码默认值"
    status: in_progress
  - id: behavior-script-boundary-clarification
    content: "专项: 明确类人行为中配置驱动与内置脚本驱动的边界，补齐文档与前端提示"
    status: in_progress
  - id: behavior-observability-and-acceptance
    content: "专项: 为设备模拟与类人行为增加 inspect / 启动摘要 / 验收清单，支持封控排查"
    status: in_progress
isProject: false
---

# REFACTOR.md 一致性整改计划

## 当前状态表（2026-03-17）

| ID | 状态 | 结论 |
|---|---|---|
| `behavior-inject` | `completed` | 已完成 |
| `behavior-session` | `completed` | 已完成 |
| `behavior-background` | `completed` | 已完成 |
| `device-flow` | `completed` | 账号级设备解析已接线并进入 Link 连接流程 |
| `device-default-routes` | `completed` | 已补齐默认设备路由与前端管理入口 |
| `runner-delegate` | `completed` | 已拆出 scheduler/daily/factory 以及 `actions/connection/emitter/lifecycle/link-events/login-ready/operations/runtime/setup/starter/state/ticks/workers`，`AccountRunner` 已降到 235 行，已进入目标区间 |
| `manager-split` | `completed` | 已完成，旧 `AccountManagerService` 已移除 |
| `event-driven` | `completed` | 已完成，事件发射/监听链已稳定运行 |
| `shared-event-constants-unification` | `completed` | core 事件常量已改为复用 shared，push route 常量也已统一 |
| `friend-split` | `completed` | 已拆出 `friend-help` / `friend-steal` / `friend-land-analysis` / `friend-land-detail` / `friend-interact` / `friend-list` / `friend-applications` / `friend-cycle` / `friend-loop` / `friend-operation-limits` / `friend-service-client` / `friend-public-api`，主文件已降到 259 行 |
| `web-behavior-ui` | `completed` | 已完成，但落地为独立 `/behavior` 页面 |
| `web-api-typing` | `completed` | `apps/web/src/api/modules`、stores 以及高频 views/components 已完成类型收口，目标范围内 `Promise<any>` / `any` 已清空 |
| `strategy-page-embed` | `accepted_deviation` | 当前确认维持独立 `/behavior` 页面，不回退到策略页内嵌 |
| `link-restructure` | `completed` | 已拆出 `proto/invoke-type-map.ts`、`crypto/crypto-wasm.ts`，并按职责分出 `connection/`、`proto/`、`tcp/`；`GameClient` 主类现为 291 行，已进入目标区间，Link 边界类型也已收口 |
| `device-identity-hardening` | `in_progress` | 已切掉历史 `runtimeClient` 兼容层，当前设备来源收口为“账号设备 / 全局默认设备 / 内置默认预设”，但 inspect、日志和文案仍需继续补齐 |
| `link-device-hardcode-cleanup` | `in_progress` | Link 已支持上传设备参数，但 `GameClientConfig` 仍保留独立的 UA / `deviceId` / origin 默认硬编码 |
| `behavior-script-boundary-clarification` | `in_progress` | 行为增强已接线，但热身请求、背景请求和部分步长限幅仍属于内置脚本，文档与前端提示尚未完整说明 |
| `behavior-observability-and-acceptance` | `in_progress` | 当前缺少能直接回答“账号实际在模拟什么”的 inspect / 摘要 / 验收清单 |

## 现状评估

早期判断已经过时。当前仓库不再是“只有目录和空壳文件”，而是已经完成了相当多的真实接线。以下为最新对比：

### 已完成（约 65-75%）

- 目录搬迁：`auth/`, `qr/`, `account/`, `realtime/` 从 `modules/` 提升到顶层
- 重命名：`client-driven/` -> `session/`, `services/` -> `workers/`
- 账号侧已拆为 `AccountLifecycleService` + `AccountRegistryService` + `AccountStatusService`，旧 `AccountManagerService` 已移除
- `AccountRunner` 已接入 `RunnerScheduler`、`RunnerDaily`、`WorkerFactory`
- `EventEmitter2` 已投入主流程，`AccountRunner` 发射事件，`AccountStatusService` / bridge 使用 `@OnEvent`
- Behavior 模块已接线：`DelayService`、`RhythmService`、`SessionPatternService`、`SessionBootstrapService`、`BackgroundRequestService`、`ActiveHoursService` 均已进入执行链
- `device-fingerprint.ts` 已存在，账号启动已按 `deviceProfileId` 解析设备指纹
- Schema：`device_profiles` 表、`account_configs.behavior` + `device_profile_id` 字段
- Shared types：`BehaviorConfig`、`DeviceProfile` 已存在
- 前端：行为页、设备管理页、`BehaviorConfigCard.vue`、`DeviceConfigCard.vue`、`DeviceSelectDropdown.vue`、`DevicePresetCard.vue`、`DeviceProfileCard.vue`、`DeviceEditModal.vue`
- Store persistence 已从 `sessionStorage` 迁到 `localStorage`
- `apps/web/src/api/types/` 目录已建立

### 仍未完成的重大差异（约 15-20%）

---

## 差异 1：AccountRunner 瘦身已基本完成（约 235 行）

**REFACTOR.md 目标**：拆为 `AccountRunner(~150)` + `RunnerScheduler(~120)` + `RunnerDaily(~100)` + `WorkerFactory(~80)`

**现状**：

- `RunnerScheduler`、`RunnerDaily`、`WorkerFactory` 已被真实使用，不再是空壳
- 并且已进一步拆出 `actions`、`connection`、`emitter`、`lifecycle`、`link-events`、`login-ready`、`operations`、`runtime`、`setup`、`starter`、`state`、`ticks`，以及统一装配的 `account-runner-handler-factory.ts`
- `AccountRunner` 主文件已降到 235 行，已经进入原计划的目标区间
- 当前剩余更多属于可选优化，而不是阻塞计划收口的 God Class 问题

---

## 差异 2：FriendWorker 拆分已基本完成（约 259 行）

**REFACTOR.md 目标**：`friend.worker.ts(~300)` + `friend-help.ts(~300)` + `friend-steal.ts(~300)`

**现状**：

- `friend-help.ts` / `friend-steal.ts` 已接入主流程
- 已进一步拆出 `friend-land-analysis.ts`、`friend-land-detail.ts`、`friend-interact.ts`、`friend-list.ts`、`friend-applications.ts`、`friend-cycle.ts`、`friend-loop.ts`、`friend-operation-limits.ts`、`friend-service-client.ts`、`friend-public-api.ts`
- 主文件已低于 `~300` 行目标，这一项可以视为完成

---

## 差异 3：事件驱动与共享事件常量已统一

**REFACTOR.md 目标**：`AccountRunnerCallbacks` -> `EventEmitter2` + `@OnEvent`

**现状**：

- `AccountRunner` 已发射 `status/log/kicked/ws_error/data` 等事件
- `AccountStatusService` 和 `realtime/account-push.bridge.ts` 已大量使用 `@OnEvent`
- `packages/shared/src/protocol/events.ts` 现已补齐 `account.data.*` 常量，并修正 `dailyGifts.update` 命名
- `apps/core/src/account/account.events.ts` 已改为复用 shared 常量，push route 也统一改用 shared 定义

---

## 差异 4：Behavior 模块已完成接线

**REFACTOR.md 目标**：替换所有 `sleep(N)` + 使用 Session/Rhythm/Background 服务

**现状**：

- `DelayService` / `RhythmService` 已注入 workers 和 actions
- core 中原先那批 `else sleep(N)` fallback 已不再存在
- `SessionBootstrapService`、`BackgroundRequestService`、`SessionPatternService`、`ActiveHoursService` 已在 runner 流程中被调用
- 这一项应维持“已完成”，不再作为待执行项

---

## 差异 5：Device 模块已接入账号启动，默认设备链路已补齐

**REFACTOR.md 目标**：`AccountRunner.start()` -> `resolveForAccount()` -> 传给 Link

**现状**：

- `device-fingerprint.ts` 已存在
- `AccountRunner.start()` / `AccountRunnerFactory` 已按账号 `deviceProfileId` 解析设备配置
- 账号级设备配置已生效，不再只是历史全局 `runtimeClient`
- `device.setDefault`、`device.getDefault` 路由与前端默认设备管理流已补齐

---

## 差异 6：前端行为/设备 UI 与 API 类型化已完成

**REFACTOR.md 目标**：策略页增加行为配置卡片 + 设备选择，并逐步消灭 `any`

**现状**：

- 行为配置页和设备管理组件已全部存在
- `localStorage` 持久化已落地
- `apps/web/src/api/types/` 已存在
- `api/modules/*.ts`、stores 以及高频 views/components 已完成类型收口
- 目标范围内 `apps/web/src/api`、`stores`、`views`、`components` 中的 `Promise<any>` / `any` 已清空
- 另外，UI 最终落成在独立 `/behavior` 页面，而不是原文设想的“塞进策略页”

### 仍需单列治理的高风险专项

虽然 device / behavior 相关基础功能已经接线，但若从“封控风险治理”视角审视，当前还不能直接标为完全收口。现阶段主要剩余问题集中在：

- 设备模拟链路仍存在多层 fallback 混合，最终设备来源不够单一
- Link 中仍保留与设备模拟目标冲突的身份硬编码默认值
- 类人行为中的“配置驱动”与“内置脚本驱动”边界没有在文档和 UI 提示中完全讲清
- 缺少 inspect / 启动摘要 / 验收清单，难以支撑风控排查

专项计划已拆到 [2026-03-17-device-behavior-hardening-plan.md](/home/zyy/桌面/Codes/qq-farm-bot-nest/docs/plans/2026-03-17-device-behavior-hardening-plan.md)。

---

## 差异 7：Link 重构已完成主体目标

**REFACTOR.md 目标**：按职责分子目录 `tcp/`, `connection/`, `proto/`, `crypto/`

**现状**：

- Link 已从单层平铺推进到 `connection/`、`crypto/`、`proto/`、`tcp/` 的分层结构
- `INVOKE_TYPE_MAP` 已抽到 `proto/invoke-type-map.ts`
- `crypto/crypto-wasm.ts` 已补上 buffer 生命周期的 `try/finally` 保护
- `game-invoke.service.ts` 已降到 135 行，`ProtoLoaderService` 60 行，`TcpServerService` 143 行，`ConnectionManagerService` 183 行
- `connection/game-client.ts` 已进一步拆出 `game-client-config.ts`、`game-client-message.ts`、`game-client-notify.ts`、`game-client-packets.ts`、`game-client-activity.ts`、`game-client-transport.ts`、`game-client-events.ts`，主类现为 291 行
- Link 侧主文件体量已进入目标区间，目录分层、crypto 生命周期保护、协议映射抽离和边界类型收口均已完成

---

## 整改执行计划（按当前状态修订）

### Phase A：核心接线 — Behavior 集成

状态：`completed`

- `DelayService` / `RhythmService` 已接入 workers 和 actions
- `SessionBootstrapService`、`SessionPatternService`、`BackgroundRequestService`、`ActiveHoursService` 已进入 runner 主流程
- 这一阶段不再作为待办

### Phase B：核心接线 — Device 集成

状态：`completed`

已完成：

1. **AccountRunner.start() 调用 `resolveForAccount()`**
2. **账号级设备配置已传给 `linkClient.connectAccount()`**

- `device.setDefault` / `device.getDefault` 已补齐
- 前端默认设备配置流已打通

补充说明：

- “基础接线完成”不等于“封控风险治理完成”
- 最终设备来源收口、Link 身份硬编码清理、设备可观测性仍需按专项计划继续推进

### Phase C：God Class 拆分

状态：`completed`

已完成：

1. **AccountRunner 使用 RunnerScheduler**
2. **AccountRunner 使用 RunnerDaily**
3. **AccountRunner 使用 WorkerFactory**
4. **AccountManagerService 拆分**
   - 已完成为 `AccountLifecycleService` + `AccountRegistryService` + `AccountStatusService`

补充说明：

1. **`AccountRunner` 已压到 235 行**
   - 当前已达到原计划“主类明显瘦身”的目标
2. **新拆出 service 体量仍可继续优化**
   - `AccountLifecycleService`、`AccountStatusService` 的进一步压缩属于后续非阻塞优化，不再阻塞本计划收口

### Phase D：回调链 -> 事件驱动

状态：`completed`

已完成：

1. **定义事件 payload 类型**
2. **AccountRunner 发射事件替代回调**
3. **AccountStatusService 使用 `@OnEvent` 监听**
4. **Realtime bridge 已迁移为事件监听**

### Phase E：FriendWorker 进一步拆分

状态：`completed`

已完成：

1. **已抽出 `friend-help.ts`**
2. **已抽出 `friend-steal.ts`**
3. **已继续拆出 `friend-land-analysis.ts`、`friend-land-detail.ts`、`friend-interact.ts`、`friend-list.ts`、`friend-applications.ts`、`friend-cycle.ts`、`friend-loop.ts`、`friend-operation-limits.ts`、`friend-service-client.ts`、`friend-public-api.ts`**
4. **主文件已压到 259 行**

### Phase F：前端 UI 与类型收口

状态：`completed`，并接受独立页面偏差

已完成：

1. **`BehaviorConfigCard.vue` 已创建**
2. **`DeviceConfigCard.vue` + `DeviceSelectDropdown.vue` 已创建**
3. **设备页组件已拆分**
4. **Store persistence 已改为 `localStorage`**

---

## Device / Behavior 风控专项

状态：`in_progress`

本块不再并入“普通重构收尾”，而是单独视为高风险专项治理。原因是：

- 设备模拟和类人行为直接影响账号封控风险
- 当前实现虽然可用，但仍存在“来源混合”“底层硬编码”“脚本边界不清”“缺少可观测性”四类问题

专项拆分如下：

1. `device-identity-hardening`
   - 收口账号设备、全局默认设备、内置默认预设的关系
   - 保证最终设备来源单一且可追踪

2. `link-device-hardcode-cleanup`
   - 清理 Link 中与设备模拟冲突的身份硬编码
   - 避免上游未完整传值时回落到与预设库不一致的默认身份

3. `behavior-script-boundary-clarification`
   - 明确哪些行为受配置驱动
   - 明确哪些行为属于固定内置脚本
   - 同步更新文档与前端提示

4. `behavior-observability-and-acceptance`
   - 增加 inspect / 启动摘要 / 验收清单
   - 让风控排查可以直接回答“当前账号实际在模拟什么”

详细方案见：

- [2026-03-17-device-behavior-hardening-plan.md](/home/zyy/桌面/Codes/qq-farm-bot-nest/docs/plans/2026-03-17-device-behavior-hardening-plan.md)
5. **`apps/web/src/api/types/` 已建立**
6. **`apps/web/src/api`、`stores`、高频 `views/components` 已完成类型收口**
7. **目标范围内 `Promise<any>` / `any` 已清空**

### Phase G：Link 整理

状态：`completed`

已完成：

1. **按职责分出子目录**：`connection/`, `crypto/`, `proto/`, `tcp/`
2. **`crypto-wasm.ts` 已加 `try/finally` 保护**
3. **已抽出 `invoke-type-map.ts`**
4. **`GameClient` 已进一步拆出 config/message/notify/packets/activity/transport helper**

补充说明：

1. **当前主目标已达成**
   - 目录分层、`invoke-type-map.ts`、`crypto-wasm.ts` 生命周期保护、`GameClient` 拆分均已完成
2. **后续若继续投入**
   - 更适合做测试补充或小幅边界清理，而不是继续围绕结构整改开新阶段

---

## 后续非阻塞优化

```text
1. `AccountLifecycleService` 已压到 222 行，`AccountStatusService` 已压到 288 行，这条统一 `<300` 行约束已不再是待办。
2. Link 当前更适合补测试或做边界清理，而不是继续做结构级重构。
3. `/behavior` 独立页面已确认为接受偏差，不再回归策略页内嵌。
```
