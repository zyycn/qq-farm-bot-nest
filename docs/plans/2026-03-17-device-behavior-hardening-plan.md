# Device / Behavior Hardening Plan

> 2026-03-18 状态说明：该方案中的“类人行为模拟”部分已废弃并从代码中移除，当前项目仅保留设备配置与设备模拟相关能力。本文件仅作为历史记录保留。

## 背景

设备模拟与类人行为模拟已经完成基础接线，但当前实现与文档描述之间仍有几处关键偏差。  
这部分不是“体验优化”，而是直接影响账号封控风险的专项治理项，必须单独规划、单独验收。

本方案聚焦两条链路：

- 设备模拟：账号启动到 Link 登录包的设备参数生成、传递、兜底逻辑
- 类人行为模拟：延迟、节奏、登录热身、背景请求、活跃时段、多账号抖动

## 目标

### 目标 1：设备配置来源单一且可解释

任一账号在启动时，最终使用的设备配置必须可以明确追溯到以下唯一来源之一：

- 账号指定设备
- 全局默认设备
- 内置默认预设 fallback

禁止“账号设备 / 全局默认设备 / 内置默认预设”之外的隐式来源混入，避免排查时无法解释实际登录参数来源。

### 目标 2：Link 侧不再持有与设备模拟冲突的硬编码身份参数

Link 可以保留协议层默认值，但不能继续持有会与上层设备模拟目标冲突的身份硬编码，例如：

- 固定 Windows 微信 `User-Agent`
- 固定 `deviceId` 拼接
- 与预设库不一致的默认平台/设备指纹

### 目标 3：类人行为配置的“可配置边界”要和文档一致

需要明确区分两类内容：

- 可配置行为：用户在 `/behavior` 页修改后会直接影响执行
- 内置策略脚本：固定请求池、固定顺序、固定限幅，仅受开关控制

文档、前端文案、代码行为必须一致，不能让使用者误以为“页面上所有项都能完整控制实际执行节奏”。

### 目标 4：封控风险相关行为必须具备验收清单

本专项完成后，需要能回答以下问题：

- 某个账号当前实际用的是哪套设备参数？
- 这些参数来自哪里？
- 登录热身序列是否固定？如果固定，固定到什么程度？
- 背景请求是否可配置？如果不可配置，哪些部分是内置策略？
- 在关闭类人行为增强后，哪些行为仍会继续生效？

## 当前主要偏差

### 1. 设备模拟链路仍存在隐式混合

历史问题在于 `DeviceFingerprintService.resolveForAccount()` 曾同时混入：

- `iphone-x-default` 预设基底
- 历史 `runtimeClient`
- 账号/默认设备 profile

这意味着“按账号设备配置启动”并不是完全独立成档，而是被历史 fallback 持续污染。

影响：

- 实际登录参数来源不透明
- 排查封控时很难复盘真实设备指纹
- profile 看起来完整，但运行时可能被历史 fallback 改写

### 2. Link 侧仍保留身份硬编码

当前 Link 默认配置仍内置：

- 固定 `DEFAULT_USER_AGENT`
- 固定 `DEFAULT_ORIGIN`
- 固定 `deviceId` 拼接逻辑

影响：

- 当上游未完整传值时，会回落到与设备预设不一致的身份参数
- 设备模拟“看似接线完成”，但底层仍可能暴露历史特征

### 3. 行为模拟里存在“半配置、半硬编码”区域

当前以下内容仍是固定脚本或固定限幅：

- `SessionBootstrapService` 的请求序列
- `BackgroundRequestService` 的请求池
- `bootstrapStep()` 与 `backgroundRequestStep()` 的 `20ms/120ms` 限幅

影响：

- 前端配置不能完整映射到运行时行为
- 文档容易夸大“自定义模式”的控制范围

### 4. 文档与最终 UI/实现已有偏差但未同步

已发现的偏差包括：

- 设备卡片 summary 仍展示 `deviceId`
- 行为页已明确说明 `activeHours` 不随总开关回退，但总文档未同步强调
- 总计划文件已把相关项标记为 `completed`，但风险收口并未完成

## 设计原则

### 原则 1：设备身份参数与连接参数分层

建议将“连接参数”和“设备身份参数”明确分离：

- 连接参数：`serverUrl`、`origin`、必要协议版本
- 设备身份参数：`userAgent`、`platform`、`os`、`deviceInfo.*`

这样可以避免把“方便调试的连接参数 fallback”误用于真实设备指纹拼装。

### 原则 2：显式 fallback，不做隐式补洞

若必须保留历史兼容路径，必须在代码和文档中显式声明：

- 哪些字段允许 fallback
- fallback 来源是什么
- 哪些字段禁止 fallback

尤其是 `userAgent`、`deviceId`、`sysHardware` 这类强身份字段，不应继续静默补洞。

### 原则 3：行为模拟脚本化部分单独命名

建议把以下内容从“纯配置驱动行为”中分离命名：

- 登录热身脚本
- 背景请求脚本

文档中统一称为：

- `内置热身脚本`
- `内置背景请求脚本`

避免与 `delay/rhythm/session/friend/multiAccount` 这些真实配置驱动项混淆。

### 原则 4：封控相关配置必须能回放

需要保留可观察性：

- runner 启动时记录“最终设备来源”
- 在 `behavior.inspect` 或新接口中返回“最终生效设备/行为摘要”
- 能明确看出当前账号是否走了 fallback

## 建议整改拆分

### Phase 1：设备模拟收口

当前进度：

- 已开始
- `DeviceFingerprintService` 现已输出结构化解析结果（来源、选中项、base preset、fallback 字段）
- `AccountRunnerFactory` 与 `AccountRunnerStarter` 已统一消费同一份解析结果，移除启动时的重复设备解析
- `AccountRunner` 状态快照已附带设备来源摘要，可用于后续 inspect 与排查
- `behavior.inspect` 现已返回“配置态设备摘要 + 运行态设备摘要 + 行为脚本边界说明”，避免前端自行拼装解释

#### 1.1 统一设备解析入口

保留唯一入口：

- `AccountRunnerFactory.resolveRuntimeClient()`

已补充：

- `DeviceFingerprintService.resolveAccountDeviceConfig()`

禁止在 `starter`、`runner`、`Link` 内再次重复拼设备配置。

#### 1.2 拆分解析结果结构

建议让设备解析返回：

- `resolvedConfig`
- `source`
- `usedFallback`
- `fallbackFields`

其中 `source` 至少区分：

- `account_profile`
- `global_default_profile`
- `built_in_default_preset`

#### 1.3 限制 fallback 范围

优先建议：

- `serverUrl`、`origin` 仅允许从设备预设基底补齐
- `userAgent`、`platform`、`os`、`deviceId`、`sysHardware` 禁止从历史兼容配置静默补值

#### 1.4 清理 Link 身份硬编码

`GameClientConfig` 中以下值改为：

- 要么来自 resolved device config
- 要么来自共享预设默认值
- 不再使用与预设库无关的独立硬编码

### Phase 2：类人行为收口

#### 2.1 明确“配置驱动”与“脚本驱动”边界

将行为模块分为两层：

- 配置驱动层：`ActionPacerService`、`RhythmService`、`ActiveHoursService`
- 脚本驱动层：`SessionBootstrapService`、`BackgroundRequestService`

#### 2.2 脚本策略文档化

对热身请求和背景请求分别补文档：

- 固定请求池
- 触发时机
- 是否随机取样
- 当前不可配置项

#### 2.3 清理硬编码限幅

`bootstrapStep()`、`backgroundRequestStep()` 的固定 `20/120ms` 应二选一：

- 纳入 shared behavior config
- 或在文档中明确其为固定内置限制

#### 2.4 补“总开关不影响 activeHours”的专项说明

前后端文案、总计划文档、专项文档必须统一说明：

- `enabled=false` 仅回退增强行为
- `activeHours` 仍按子开关独立生效

### Phase 3：可观测性与验收

#### 3.1 增加 inspect 能力

建议新增或扩展检查接口，至少返回：

- 最终设备来源
- 最终设备关键字段摘要
- 是否触发 fallback
- 当前行为模式
- 当前是否启用热身脚本 / 背景请求脚本 / activeHours

当前进度：

- `accounts.status` / runner 状态快照中已补充设备来源摘要
- `behavior.inspect` 已补充专门输出，包含最终设备来源、fallback、内置热身脚本、内置背景请求脚本、activeHours 独立生效状态

#### 3.2 增加启动日志摘要

账号启动时建议打印一条结构化摘要日志：

- 设备来源
- 平台 / OS / 机型 / UA 摘要
- 行为模式
- 是否启用 session bootstrap / background requests / activeHours

#### 3.3 补验收清单

验收最少覆盖：

1. 账号未配置设备，且全局默认设备为空
2. 账号未配置设备，但全局默认设备存在
3. 账号指定内置预设
4. 账号指定自定义设备
5. `enabled=false` 时 activeHours 仍生效
6. `custom` 模式下 delay/rhythm 参数实际影响调度
7. 热身脚本/背景请求脚本的执行结果与文档一致

## 文档整改要求

需要同步更新的文档：

- `REFACTOR.md`
- `refactor.md_一致性整改_93169bd8.plan.md`
- 本专项文档
- `/behavior` 页面提示文案
- 设备管理页提示文案

更新要求：

- 不再把设备/行为这块简单标为“已完成”
- 改成“基础接线完成，风控一致性治理进行中”
- 明确列出已完成项和待收口项

## 建议状态定义

建议为这块新增 4 个专项 todo：

- `device-identity-hardening`
- `link-device-hardcode-cleanup`
- `behavior-script-boundary-clarification`
- `behavior-observability-and-acceptance`

状态建议先统一标为 `in_progress`。

## 非目标

本专项不包含：

- 补测试
- 调整 `/behavior` 页面是否内嵌
- 大规模改 UI 外观
- Link 协议层的进一步结构重构

## 完成标准

满足以下条件后，才可把这块从“高风险专项”降为“已收口”：

- 设备最终来源单一且可追踪
- Link 不再保留与设备模拟冲突的身份硬编码
- 行为模拟的可配置范围和脚本范围已明确分层
- 文档、前端文案、后端实现三者一致
- inspect / 日志可以回答“当前账号实际在模拟什么”

## 当前实施进展（2026-03-17）

### 已完成

- `DeviceFingerprintService` 已输出结构化解析结果，不再只返回裸 `ClientConfig`
- `AccountRunnerFactory` / `AccountRunnerStarter` 已统一消费同一份设备解析结果
- runner 状态快照已附带设备来源、选中项、fallback 字段摘要
- Link 默认身份参数（`userAgent` / `origin` / `deviceId` / `sysHardware` / 屏幕尺寸 / GPU 等）已从 `game-client-config.ts` 的独立硬编码迁到 shared 常量，默认来源已统一
- 历史 `runtimeClient` 兼容层已删除，设备解析不再依赖旧的全局运行时连接配置
- `SessionBootstrapService` 与 `BackgroundRequestService` 的固定脚本已抽成显式常量，inspect 可直接返回脚本池与固定步长上限
- 设备预览卡已移除 `deviceId` 摘要展示，运行时连接面板已明确标注“兼容字段不会覆盖最终设备身份”

### 仍在进行中

- inspect / 启动摘要 / 前端提示还未完全补齐

### 本轮补充

- `AccountRunner` 启动时已增加结构化行为摘要日志，包含模式、快速回退、热身脚本、背景请求频率、activeHours 状态
- `/behavior` 页面已接入 `behavior.inspect` 摘要卡，前端可直接看到最终设备来源与脚本边界
## 2026-03-17 Coordination Update

This document stays focused on device / behavior hardening, but its runtime boundary must now align with the unified pacing migration.

Alignment rules:

- request-time behavior control belongs to `RequestPacingGateway`
- non-request runtime timing belongs to `RuntimePolicyCoordinator`
- business modules must not directly carry `delay`, `rhythm`, `session`, `backgroundRequests`, `activeHours`, or `multiAccount` semantics
- `/behavior` page configuration remains the only user-facing strategy input, but those inputs are mapped into unified request/runtime policy layers rather than scattered service calls

For this document, that means:

- built-in script observability still lives here
- device identity hardening still lives here
- request pacing implementation details should move to `2026-03-17-unified-request-pacing-design.md`
- session and multi-account hardening must be implemented through the runtime coordination layer instead of business workers
