# Unified Request Pacing Design

> 2026-03-18 状态说明：该方案已废弃。仓库已移除类人行为模拟、统一请求节奏控制和相关前后端配置入口，当前仅保留设备配置与设备模拟能力。本文件仅作为历史记录保留。

## 背景

当前项目的类人行为与封控相关节奏控制，已经分散在多个层次：

- `DelayService`
- `RhythmService`
- `ActionPacerService`
- `SessionPatternService`
- `SessionBootstrapService`
- `BackgroundRequestService`
- 各个 worker / action 内部的局部延迟

这会带来三个直接问题：

1. 真实出站请求没有统一出口策略，同类请求在不同模块可能套不同节奏
2. 封控排查时，很难回答“某个请求为什么在这个时间发出”
3. 新增调用点时，很容易绕开既有行为模拟

本方案的目标不是把所有等待都搬到一个类里，而是明确分层：

- 业务编排负责“先做什么、后做什么”
- 统一出口负责“请求何时真正发出去”

## 设计目标

### 目标 1：真实出站请求统一经过一个节奏闸门

所有会发往游戏服务器的业务请求，都应在 transport 出口统一经过：

- 分类
- 延迟
- 抖动
- 限流
- 静默时段控制
- 行为模式策略

### 目标 2：业务层不再直接决定最终发包时间

业务层可以声明：

- 请求类别
- 风险等级
- 是否批量
- 是否必须立即发送

但业务层不应再到处直接写：

- `sleep(50)`
- `rapidFire(120)`
- `action(200)`

### 目标 3：心跳、上报、装饰性请求不再依赖业务编排触发节奏

像下面这类请求，不应混在“收菜/浇水/偷菜”的业务链里决定节奏：

- 心跳
- BCRF/活跃上报
- 登录热身请求
- 背景装饰请求

这些请求应由统一出口和行为策略共同管控。

### 目标 4：请求策略可解释、可观测

需要能够回答：

- 这次请求属于什么类别
- 命中了哪条 pacing policy
- 为什么延迟了这段时间
- 为什么在当前模式下被放行或抑制

## 核心原则

### 原则 1：业务顺序与发包节奏分离

例如：

- 收菜 -> 卖果实 -> 重新种植
- 进入好友农场 -> 帮忙 -> 偷菜 -> 离开

这些是业务流程，应该继续留在业务层。

但每一步里的 RPC 发包间隔，不应由业务代码自己散落决定，而应统一交给出口。

### 原则 2：业务层只保留顺序，不保留时间控制

业务层只负责声明调用顺序，例如：

- 先收菜，再卖果实，再重新种植
- 先进入好友农场，再帮忙，再偷菜，再离开
- 先检查奖励状态，再执行领取

业务层不再保留任何“请求之间等待多久”的实现。  
无论原来被视为“业务语义停顿”还是“通用请求节奏”，都统一下沉到出口层。

### 原则 3：出口层负责相邻请求之间的全部节奏控制

出口层负责：

- 请求前延迟
- 相邻请求之间的间隔
- 批量请求渐变节奏
- 分类限流
- 模式感知
- 活跃时段 gating
- 审计日志

出口层不负责：

- 决定业务先后顺序
- 决定是否 harvest 后立即 plant
- 决定好友循环访问策略

### 原则 4：出口层必须内建稳定性保护

统一出口不能只是“单队列 + sleep”，否则会引入新的稳定性问题：

- 请求在队列里堆积
- 业务 `await` 超时
- 低优先级请求拖住高优先级请求
- 一个超时引发一连串失败

因此第一版就必须同时具备：

- 分级队列
- `queue wait timeout` 与 `invoke timeout` 分离
- 低优先级请求可丢弃
- 可区分的失败语义

### 原则 5：能力边界先于具体实现

在落代码前，先统一请求分类和策略边界，再做实现迁移。  
否则只会把散落 delay 从 A 搬到 B，而不是建立真正的统一出口。

## 什么属于业务，什么属于统一出口

### 业务层负责的内容

示例：

- 收菜
- 浇水
- 除草
- 除虫
- 施肥
- 种植
- 好友访问
- 帮忙 / 偷菜
- 领取任务奖励

这些动作决定“要不要做”“做几次”“顺序是什么”。

### 统一出口负责的内容

示例：

- 请求发出前的基础延迟
- 批量请求的间隔变化
- 热身请求的 pacing
- 背景请求的 pacing
- 心跳 / 活跃上报的最小间隔
- 某类请求的静默期限流
- 高风险写操作的节奏增强

### 心跳 / 上报的归属

以下请求应明确归为“统一出口策略控制”，而不是继续混在业务编排里：

- `Heartbeat`
- `BatchClientReportFlow`
- 登录热身脚本内请求
- 背景装饰请求

它们可以由业务或行为模块触发，但最终发送节奏必须走统一出口。

## 建议架构

## 1. 新增统一出口层

建议引入一层：

- `BehaviorAwareTransport`
或
- `RequestPacingGateway`

位置建议：

- `apps/core/src/transport/behavior-aware-transport.ts`
或
- `apps/core/src/behavior/request-pacing.gateway.ts`

它包裹现有 `IGameTransport`，对所有 `invoke()` 请求进行策略处理。

### 结构示意

```ts
business worker / session / behavior script
  -> invokeWithPolicy(...)
  -> RequestPacingGateway
  -> LinkClientService / AccountTransport
  -> TCP / Link
```

## 2. 新增请求元信息

业务层不再只调用：

```ts
client.invoke(service, method, params)
```

而是调用：

```ts
client.invokeWithPolicy({
  service,
  method,
  params,
  policy: {
    category: 'farm_write',
    risk: 'high',
    source: 'business',
    batchKey: 'fertilize',
    immediate: false
  }
})
```

### 推荐最小元信息

```ts
interface RequestPolicy {
  category:
    | 'farm_read'
    | 'farm_write'
    | 'friend_visit'
    | 'friend_write'
    | 'warehouse_write'
    | 'task_claim'
    | 'daily_reward'
    | 'session_bootstrap'
    | 'background'
    | 'heartbeat'
    | 'activity_report'
  risk: 'low' | 'medium' | 'high'
  source: 'business' | 'bootstrap' | 'background' | 'system'
  batchKey?: string
  immediate?: boolean
  allowInQuietHours?: boolean
}
```

## 3. 队列与超时模型

统一出口必须把“排队等待”和“真正调用”拆开建模。

### 推荐请求包络

```ts
interface RequestEnvelope {
  service: string
  method: string
  params: Record<string, unknown>
  policy: RequestPolicy
  queue: 'system' | 'interactive' | 'automation' | 'script'
  queueWaitTimeoutMs: number
  invokeTimeoutMs: number
  maxQueueDelayMs?: number
  dropIfQueueBusy?: boolean
}
```

### 为什么必须分开

如果只保留一个总超时，统一出口会出现这种错误行为：

1. 请求先在队列里等了很久
2. 真正发出时已经接近超时
3. 业务侧只看到一次笼统的 `Link 请求超时`

这会让问题无法定位，也会让低优先级请求拖垮高优先级链路。

### 建议的队列分级

- `system`
  - 心跳
  - BCRF
  - 必要保活
- `interactive`
  - 用户手动点击触发的操作
- `automation`
  - 自动收菜
  - 自动好友循环
  - 自动每日任务
- `script`
  - 登录热身
  - 背景装饰请求
  - 启动恢复检查

### 建议优先级

- `system` 最高
- `interactive` 高于 `automation`
- `script` 最低

### 建议的阻塞策略

- `system` 不应被低优先级请求拖住
- `interactive` 可以插到 `automation` / `script` 前面
- `script` 在队列繁忙时允许直接丢弃
- `automation` 可以排队，但不能无限堆积

### 必须支持的失败语义

统一出口至少要区分以下几类失败：

- 请求排队超时
- 请求已发送但服务端超时
- 请求被策略主动丢弃
- 请求被 quiet hours 抑制

不能全部混成一个“调用失败”。

## 4. 策略层统一决策

统一出口收到请求后，按以下顺序处理：

1. 判断当前账号行为模式
2. 判断 activeHours / quietMode
3. 判断队列类别与优先级
4. 判断是否属于允许立即发送的系统请求
5. 依据 `category + risk + source` 选择 pacing policy
6. 若属于批量请求，叠加 batch 节奏
7. 生成最终延迟
8. 检查是否会超过 `queueWaitTimeoutMs / maxQueueDelayMs`
9. 记录策略命中摘要
10. 真正调用底层 transport

## 请求分类建议

### A. 业务读请求

示例：

- `AllLands`
- `Bag`
- `GetAllFriends`

特点：

- 风险低
- 可较快
- 适合轻量抖动

### B. 业务写请求

示例：

- `Harvest`
- `WaterLand`
- `WeedOut`
- `Insecticide`
- `Fertilize`
- `Plant`
- `Sell`

特点：

- 风险高
- 必须受统一节奏控制
- 批量连续调用时必须渐变

### C. 好友访问请求

示例：

- `Visit.Enter`
- `Visit.Leave`
- `CheckCanOperate`

特点：

- 易形成规律访问轨迹
- 应单独限速

### D. 每日奖励请求

示例：

- 邮箱领取
- 分享礼包
- 会员礼包
- 月卡礼包

特点：

- 低频
- 可静默执行
- 适合单独的“启动恢复检查”语义

### E. 热身请求

示例：

- 登录后补环境状态
- 客户端进入会话后的初始化请求

特点：

- 不属于业务操作
- 应完全由行为策略控制

### F. 背景装饰请求

示例：

- 不改变核心业务状态，但模拟真实客户端行为的请求

特点：

- 不应穿插在业务代码里手工写 delay
- 由统一出口和行为脚本共同决定

### G. 心跳 / 活跃上报

示例：

- `Heartbeat`
- `BatchClientReportFlow`

特点：

- 不属于业务
- 不受“收菜/浇水/偷菜”流程节奏影响
- 只受系统级最小间隔、活跃时段、连接状态约束

## 关键边界示例

## 示例 1：收菜

业务层：

```ts
await session.harvest(landIds)
await session.sellAllFruits()
await session.plantSeeds(seedId, emptyLands)
```

出口层：

- `Harvest` 命中 `farm_write/high`
- `Sell` 命中 `warehouse_write/medium`
- `Plant` 命中 `farm_write/high`

最终每个 RPC 发送前的延迟由统一出口计算。

## 示例 2：浇水

业务层只表达：

```ts
await farmActions.waterLand(ids)
```

出口层决定：

- 是不是批量写操作
- 当前模式下该用多大的抖动
- 多个 land 操作之间的节奏梯度
- 当前队列是否拥塞
- 当前请求是否需要让位给更高优先级请求

## 示例 3：心跳

不应这样：

```ts
await delay.action(accountId, 80)
await sendHeartbeat()
```

应改成：

```ts
await pacingTransport.invokeWithPolicy({
  service: 'gamepb.userpb.UserService',
  method: 'Heartbeat',
  params: {},
  policy: {
    category: 'heartbeat',
    risk: 'low',
    source: 'system',
    immediate: true,
    allowInQuietHours: true
  }
})
```

这里的节奏完全由统一出口控制。

## 示例 5：队列保护

假设当前账号正在跑：

- 自动好友循环
- 背景请求脚本
- 同时用户又手动点了“施肥”

正确行为应是：

1. `interactive` 请求优先插队
2. `script` 请求如果等待过久可直接丢弃
3. `automation` 请求可继续排队，但不能无限堆积
4. `system` 请求不被前面三类阻塞

错误行为则是：

- 全都塞进一个串行长队列
- 导致手动施肥超时
- 进一步引发后续一连串业务失败

## 示例 4：登录热身

不应在脚本里自己分散写：

- `sleep(20)`
- `sleep(80)`
- `sleep(120)`

而应由脚本只声明请求序列，统一出口负责每个请求的最终 pacing。

## 配置设计建议

## 1. 现有配置保留，但改为策略输入

现有这些配置不必废弃：

- `delay`
- `rhythm`
- `session`
- `backgroundRequests`
- `activeHours`

但它们不再直接控制各个业务点 sleep，而是成为统一出口的策略输入。

## 2. 新增 pacing config 映射层

建议新增：

- `behavior/request-pacing.config.ts`

负责把现有行为配置映射成请求级策略，例如：

```ts
{
  farm_write: { baseMin, baseMax, jitter, batchCurve },
  friend_visit: { baseMin, baseMax, jitter, cooldown },
  heartbeat: { minInterval, bypassBusinessPacing: true },
  background: { sampleMin, sampleMax, stochastic: true }
}
```

## 3. activeHours 不直接决定业务，只决定出口是否放行

这样可以避免当前多个模块各自判断 activeHours。

统一规则建议：

- `business` 类请求在 quiet hours 可被阻断或延后
- `heartbeat` / `activity_report` 可允许放行
- `background` 类请求可直接禁用

## 日志与可观测性

建议统一出口输出结构化调试日志：

```ts
{
  accountId,
  service,
  method,
  category,
  risk,
  source,
  queue,
  appliedDelayMs,
  queuedForMs,
  queueWaitTimeoutMs,
  policyName,
  droppedByPolicy: false,
  suppressedByQuietHours: false
}
```

同时在 inspect 中补充：

- 当前请求策略摘要
- 各请求类别的有效区间
- 哪些类别允许绕过业务节奏

## 落地步骤

### Phase 1：先收入口，不改业务逻辑

1. 在 transport 层新增 `invokeWithPolicy`
2. 默认 `invoke` 内部也走统一出口
3. 若未提供 policy，先给默认分类
4. 同时引入最小队列模型与双超时模型

目标：

- 所有请求先能过同一个出口
- 不要求第一天就把所有分类做精细
- 但不能退化成“单队列 + sleep”

### Phase 2：把高风险业务请求迁入分类策略

优先迁移：

1. 农场写操作
2. 好友访问操作
3. 仓库售卖
4. 每日奖励

目标：

- 高风险链路不再散落写 delay

### Phase 3：把热身 / 背景 / 心跳收口

1. `SessionBootstrapService` 只负责脚本顺序
2. `BackgroundRequestService` 只负责脚本选择
3. 真正发包都由统一出口做 pacing
4. 心跳 / BCRF 明确标记为系统类别
5. `script` 类请求支持在队列繁忙时主动丢弃

### Phase 4：删除散落 delay

逐步移除：

- worker 内部固定毫秒数
- 批量 helper 内部裸 `rapidFire`
- 业务层对通用请求的手工 `action()`

说明：

- 删除的是“请求之间的时间控制”
- 业务层仍然保留请求顺序本身

## 验收标准

满足以下条件，才算这项设计真正落地：

1. 所有发往游戏服务器的请求都经过统一出口
2. 心跳、BCRF、热身、背景请求不再依赖业务编排决定节奏
3. 农场/好友/仓库/每日奖励四类高风险请求已完成分类策略
4. 业务层不再散落大量固定毫秒 sleep
5. 统一出口具备分级队列、双超时、低优先级可丢弃能力
6. inspect 或日志可解释每个请求为何以该节奏发出

## 非目标

以下内容不属于本次设计直接解决范围：

- 业务流程本身的最优策略
- 哪种植物收益最大
- 好友访问优先级算法
- 每日奖励协议本身是否可用

本设计只解决：

- 请求统一出口
- 节奏统一控制
- 风控边界清晰
- 可观测性可验收
## 2026-03-17 决策更新

本次实现采用激进迁移路径。

最终目标：

- 业务代码中不再保留分散的 delay 语义
- 业务代码中不再直接表达 `delay`、`rhythm`、`session`、`backgroundRequests`、`activeHours`、`multiAccount`
- 所有与游戏进程交互的请求节奏，统一由单一请求出口控制
- 所有非单请求级别的运行时时序策略，统一由一个运行时协调层控制
- 页面配置仍然是用户可见的唯一策略输入来源

### 下一阶段代码治理目标

除功能正确外，下一阶段还要同时满足以下代码治理目标：

- 代码更少，重复更少，避免继续扩散 `invokeXxx`、`requestContext`、`source/category/risk` 样板代码
- 代码更清晰，入口语义、业务顺序、请求执行、运行时调度四层边界明确
- 代码更可维护，优先依赖 Nest 的 provider、interceptor、decorator、module 边界，而不是手工层层透传上下文
- 代码更可阅读，业务文件应主要描述“做什么”，而不是混杂“请求怎么发、何时发、从哪条队列发”
- 统一延时和优先级仍然只允许存在于统一出口 / 统一调度层，不回流到业务模块

### Nest 高阶特性使用原则

后续重构应尽量使用 Nest 的高阶能力来减少样板代码，但必须控制魔法边界。

应优先使用：

- provider 注入：收口 `GameRpcExecutor`、`OperationCatalog`、`RuntimePolicyCoordinator`
- custom decorator：只在入口层声明请求意图，例如 `@InteractiveAction()`、`@AutomationAction()`、`@ScriptAction()`、`@SystemAction()`
- interceptor：在 websocket / controller 入口建立触发上下文，并在出口记录结构化请求审计日志
- AsyncLocalStorage 封装服务：承载当前触发上下文，替代手工透传 `requestContext`
- module 边界：把“行为策略”“请求执行”“运行时调度”拆成清晰 provider，而不是继续堆在 worker / session 巨类中
- exception filter / error mapping：统一将队列超时、quiet hours 抑制、策略丢弃转换为一致的业务错误语义

不应使用：

- 在深层业务方法上大量堆装饰器，导致真实控制流不可见
- 用装饰器直接实现 delay、sleep、queue 等核心行为
- 让业务模块依赖 service locator 或隐式全局单例来获取策略
- 让 decorator / interceptor 隐式改写业务顺序

### 推荐的目标形态

为兼顾代码清洁、简洁与可维护性，推荐逐步收敛到以下结构：

1. 入口层只声明触发意图
   - websocket handler / controller / scheduler 入口通过 decorator 标记 `interactive / automation / script / system`
   - 入口不再手写 `requestSource` 常量

2. 上下文层只承载触发元信息
   - 通过 AsyncLocalStorage 承载 `intent`、`trigger`、`requestId`
   - runner、session、worker 不再层层传 `requestContext`

3. 执行层只负责“操作别名 -> 请求出口”
   - 引入注入式 `GameRpcExecutor`
   - 业务层通过操作别名调用，例如 `executor.call('farm.plant', params)`
   - `service/method/category/risk/queue` 等元信息由 `OperationCatalog` 统一提供

4. 网关层只负责 pacing 和审计
   - `RequestPacingGateway` 继续成为唯一的统一延时、队列、quiet-hours、drop、timeout 决策点
   - 审计日志由这一层统一输出

5. session 层只负责顺序与可抢占边界
   - `GameSession` 仅表达“哪些任务可串行、哪些任务可插队、哪里允许重检”
   - 不再承担 RPC 元信息拼装

### 除当前关注点外，还应提前考虑的问题

除了 interactive 与统一延时外，后续还需要一起考虑这些问题，避免后面返工：

- 幂等与冲突控制
  - 手动与自动可能同时命中同一业务动作
  - 写操作需要在执行前增加状态重检点，避免“手动已完成，自动仍继续执行”

- 读请求去重
  - `AllLands`、`Bag`、`GetAllFriends` 这类短时间重复读取，可考虑在 executor 层做短窗口合并
  - 减少无意义请求，也减少日志噪声

- 审计字段标准化
  - 不仅记录 `queue/source/category`，还应记录 `trigger`、`operation alias`、`requestId`
  - 这样才能解释“同一个 Plant 为什么一次是 interactive，一次是 automation”

- 路由级覆盖可视化
  - inspect 不应只展示配置区间
  - 还应展示哪些入口已经显式声明 intent，哪些请求仍在走默认分类

- 模块边界收缩
  - 继续避免形成新的 God class，例如不要把所有逻辑都堆到 `GameSession` 或 `RequestPacingGateway`
  - `farm/friend/warehouse/task` 各模块仍应保留业务责任，只把共性抽到 executor/catalog/context

- 错误语义分层
  - “请求排队超时”“请求执行超时”“被 quiet hours 抑制”“被策略丢弃”需要继续保持可区分
  - 但对前端展示要统一映射为更友好的中文业务语义

- 测试边界
  - executor 层要能独立单测 operation alias 到 envelope 的映射
  - gateway 层要能测试 queue/source/timeout 规则
  - handler 层要能验证 decorator 是否正确写入 intent

### 最终分层

需要两个统一层：

1. `RequestPacingGateway`
   - 负责所有发往游戏进程请求的“请求时”语义
   - 将行为配置映射为请求策略
   - 负责队列、quiet hours gating、延迟、抖动、批量 pacing、双超时和请求审计日志
   - 成为唯一决定 RPC 何时真正发出的地方

2. `RuntimePolicyCoordinator`
   - 负责不能被简化为单次 RPC pacing 决策的运行时时序
   - 覆盖 session 生命周期和多账号调度
   - 将 `session` 和 `multiAccount` 语义从 worker、action、runner 业务流中移除

### 配置映射边界

以下类别不应再以直接业务语义的形式出现：

- `delay`
- `rhythm`
- `session`
- `backgroundRequests`
- `activeHours`
- `multiAccount`

业务层仍然可以声明：

- 操作顺序
- 批次分组
- 请求类别 / 风险 / 来源 / 队列意图
- 请求是否允许在 quiet hours 中发送

业务层不应再声明：

- 请求之间 sleep 多久
- 批次之间 sleep 多久
- friend/task 切换等待
- bootstrap/background 的 step 等待
- session linger / cold-start 时序
- multi-account 的启动抖动 / 调度偏移

### 方案 3 的实施路径

Phase A：接入统一请求出口

- 扩展 transport，支持策略感知请求入口
- 将普通 `invoke()` 也统一路由进 gateway，并赋予默认分类
- 引入队列模型、queue wait timeout、invoke timeout 和结构化请求审计日志

Phase B：迁移高风险业务链路

- 迁移农场写操作
- 迁移好友访问 / 写操作
- 迁移仓库写操作
- 迁移任务领取和每日奖励
- 从这些业务模块中移除直接 delay 语义

Phase C：迁移内置脚本和系统流量

- 让 `SessionBootstrapService` 只描述请求顺序
- 让 `BackgroundRequestService` 只描述请求选择
- 将真正的 bootstrap/background pacing 下沉到 gateway
- 将 heartbeat / activity-report 归类为 system 流量

Phase D：统一请求出口之外的运行时时序

- 引入 `RuntimePolicyCoordinator`
- 将 `session` 和 `multiAccount` 的时序所有权移出业务模块
- 即使这些问题不是单请求 pacing，也必须保证它们不再留在请求业务代码中

Phase E：移除旧时序表面

- 删除或收缩 `DelayService` 和 `ActionPacerService`，使其不再承担业务侧 pacing 语义
- 移除 worker、session helper、runner 流程中剩余的分散 timing 调用
- 最终只保留策略映射层和统一协调层

### 验收标准更新

只有满足以下全部条件，才算迁移真正完成：

- 所有发往游戏进程的请求都经过统一请求出口
- 业务代码中不再存在分散的 delay 语义
- 业务代码中不再直接暴露行为时序词汇
- 页面配置已经映射到统一请求层 / 运行时层
- 请求级 pacing 能通过 gateway 日志和 inspect 输出解释清楚
- session 和 multi-account 时序由单一运行时协调层持有，而不是继续散落在业务模块中

## 2026-03-17 实现进展

本轮已经完成：

- 在 transport 背后加入 `RequestPacingGateway` 作为统一请求出口
- 为 transport 请求加入请求策略元信息和队列模型
- 将 farm、warehouse、friend、task、daily-reward、bootstrap、background-request 流量迁移到 `invokeWithPolicy(...)`
- 将 runner 侧的 `session` 和 `multiAccount` 时序所有权迁移到 `RuntimePolicyCoordinator`
- 将 account runner 的启动、login-ready、linger、idle-disconnect、start jitter、schedule offset 接线改为 runtime coordination，而不是业务侧 session timing API

初始迁移完成后又补齐的部分：

- 删除了遗留的 `DelayService` 和 `SessionPatternService`
- 移除了核心主路径里分散的业务侧 delay 语义
- 通过 behavior inspect 和 web UI 暴露了 gateway / runtime 的摘要信息
- 将 websocket 手动入口接到了显式 `interactive` 请求上下文，包括农场操作、单地块操作、好友详情、好友手动操作、访客记录、商店购买和仓库售卖
- 将 `interactive` 请求上下文沿 `handler -> runner -> session / friend worker -> invokeWithPolicy(...)` 透传到真实请求出口
- 将 `GameSession` 内部的待执行任务改为优先级队列，允许手动任务插到尚未开始的自动化任务前面
- 为 websocket 入口增加了意图装饰器和 `AsyncLocalStorage` 上下文承载，入口层开始摆脱手写 `INTERACTIVE_REQUEST` 常量
- 外层 `requestContext` 透传已从 handler、runner、session 主链以及 friend 模块主链移除，改为由上下文自动解析
- 新增了 `GameRpcExecutor` 与 `OperationCatalog` 骨架，并已落到 `warehouse-actions`、`friend-service-client`、`farm-actions`、`task.worker`、`daily-rewards.worker`、`invite.worker`、`illustrated.worker`
- `farm-actions` 已进一步去掉通用 `invokeFarmWrite(...)` 入口，`WaterLand / WeedOut / Insecticide` 也改由 operation alias 统一映射
- `warehouse-actions` 的 `Bag / Sell / Use / BatchUse` 已完全改由 `GameRpcExecutor` 调度，不再保留过渡期读写 helper
- `friend-help`、`friend-steal`、`friend-interact` 已改为通过 operation alias 或 executor 兼容调用统一发起请求；`friend-interact` 的多候选 service/method 探测已上收为执行层能力
- `GameRpcExecutor` 已支持“候选 operation 依次尝试”的兼容调用模式，避免业务文件继续手写 `for + try/catch + invokeWithPolicy(...)`
- `RequestPacingGateway` 的审计日志已携带入口上下文、队列状态和关键超时/抑制字段，新增 `requestId`、`triggerRoute`、`triggerIntent`、`status`、`queueWaitTimeoutMs`、`invokeTimeoutMs`、`droppedByPolicy`、`suppressedByQuietHours` 等字段，便于区分 interactive / automation / script 流量
- `behavior.inspect` 已开始暴露 route intent 覆盖和 operation category 覆盖，页面可以直接看到哪些 websocket 路由是 `interactive / default`，以及 `heartbeat / activity_report` 当前是否已有显式 operation 声明

## 2026-03-17 实现差异

当前实现已经接近目标架构，但仍存在以下设计差异。

### 差异 1：interactive 已接入手动入口，但不会中断已经在执行的长任务

设计意图：

- 用户主动触发的操作应高于 automation 优先级
- 手动请求不应被 `automation` / `script` 流量阻塞

当前状态：

- `RequestPacingGateway` 已支持 `interactive` 队列
- websocket 手动入口现在已经显式携带 `requestSource: 'interactive'`
- `interactive` 请求上下文已经透传到 runner、session、friend worker 和最终的 `invokeWithPolicy(...)`
- `GameSession` 对尚未开始的任务会按优先级出队，`interactive` 会先于 pending automation 任务
- 但当前设计仍不会打断已经在执行中的 session 长任务；也就是说，手动请求可以抢到“下一棒”，不能中断“当前棒”

实际影响：

- 大多数手动操作已经不会再排在尚未开始的自动化 / script 请求后面
- 但如果某个自动化 pass 已经进入执行中，手动请求仍要等它完成后才会真正进入出口
- 若后续确认这仍会造成明显体感延迟，需要继续把长任务拆成更细检查点，或在 session 层引入更强的可抢占边界

### 差异 2：请求审计日志已具备主要诊断字段，但还缺少最终策略命名与覆盖摘要

设计意图：

- 审计日志应能解释 category、risk、source、queue、applied delay、queued time、timeout 设置，以及 suppression / drop 结果

当前状态：

- `RequestPacingGateway` 当前已记录 `accountId`、`requestId`、`triggerRoute`、`triggerIntent`、`service`、`method`、`category`、`risk`、`source`、`queue`、`queuedForMs`、`appliedDelayMs`
- 对 `queue wait timeout`、`invoke failed`、`drop`、`quiet hours suppress` 等状态，也已经记录了 `queueWaitTimeoutMs`、`invokeTimeoutMs`、`droppedByPolicy`、`suppressedByQuietHours`、`error`
- 但还没有形成设计层面所说的“最终命中哪条策略”的命名摘要，例如 `policyName`、`batchCurveName`、`routeCoverage`

实际影响：

- gateway 已经能支持大部分排障
- 但在排查“为什么是这一档延时、为什么这个入口仍走默认分类”时，还不能做到完全自解释

### 差异 3：heartbeat / activity-report 类别已存在，但系统流量覆盖还未完全验证

设计意图：

- heartbeat 和 activity-report 流量应显式归类为 `system`
- 这些请求应绕过业务 pacing 语义

当前状态：

- 分类模型里已经有 `heartbeat` 和 `activity_report`
- gateway 也已经对这两类做了专门的最小间隔处理
- inspect 现在可以直接显示 `heartbeat / activity_report` 是否已有 operation 声明
- 当前检查结果仍然说明：系统流量分类表面已准备好，但调用侧尚未发现显式接入

实际影响：

- 策略表面已经准备好
- 且现在这一缺口已经能被页面和 inspect 明确看出来，不再只是代码阅读结论

### 差异 4：inspect 当前反映的是配置区间，不是路由级覆盖证明

设计意图：

- inspect 不仅应展示配置区间，还应帮助解释实际覆盖和绕行规则

当前状态：

- behavior inspect 当前已经暴露队列名、分类区间、quiet-hours gating、script drop policy 和 runtime 区间
- 但它还不能直接显示哪些具体请求入口仍然走默认分类，哪些已经显式归类

实际影响：

- inspect 适合作为配置摘要
- 但还不足以证明所有关键路由已经映射到预期的 queue/source 语义

## 剩余工作优先级

当前最高优先级剩余工作：

1. 评估并收口“已经在执行中的长自动化任务”对 interactive 的阻塞边界，必要时把长任务拆成更细的可抢占检查点
2. 验证并显式归类剩余 system 流量，例如 heartbeat / activity-report
3. 让 inspect 能直接显示关键路由与 operation alias 的显式 queue/source 覆盖情况，而不只是配置区间
4. 验证 `GameRpcExecutor` 的兼容调用模式是否还需要进一步抽象，例如是否要补“候选 operation 命中摘要”到审计或 inspect
