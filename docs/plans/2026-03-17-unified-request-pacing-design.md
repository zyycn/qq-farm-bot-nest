# Unified Request Pacing Design

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
