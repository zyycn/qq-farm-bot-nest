# Core 应用 NestJS 架构评审报告

> 评审日期：2026-03-18
> 评审范围：`apps/core/src/`（124 个 TypeScript 文件，32 个目录）

---

## 一、整体评价

项目宏观架构（Link/Core/Web 三进程 + 领域模块划分）设计合理，NestJS 的 DI、EventEmitter、WebSocket Gateway 等核心能力使用得当。但在微观层面存在**过度拆分**、**职责混杂**、**Global 滥用**等问题。

---

## 二、问题清单

### P0: AccountRunner 过度拆分（严重）

**现状**：`account/runner/` 目录有 **19 个文件、2293 行代码**，将一个 AccountRunner 拆成 12+ 个 handler 类：

```
account-runner.ts                 # 主类 — 纯委托壳
account-runner-setup.ts           # 78 行 interface + 桥接函数
account-runner-handler-factory.ts # 又一层工厂
account-runner-actions.ts
account-runner-connection.ts
account-runner-emitter.ts
account-runner-lifecycle.ts
account-runner-link-events.ts
account-runner-login-ready.ts
account-runner-operations.ts
account-runner-runtime.ts
account-runner-starter.ts
account-runner-state.ts
account-runner-ticks.ts
account-runner-workers.ts
runner-daily.ts
runner-scheduler.ts
worker-factory.ts
account-runner.factory.ts
```

**问题**：

1. **AccountRunner 退化为纯委托壳**：几乎每个公开方法都是 `return this.xxxHandler.xxx()`，增加了一层无意义的间接调用
2. **setupAccountRunner 复杂度爆炸**：通过 `Object.assign` + getter/setter 代理连接各 handler，大量 `any` 类型，type-unsafe
3. **回调/代理地狱**：handler 之间互相访问状态需要通过 `getFlags`、`setLoginReady`、`onLogin`、`emitDataEvent` 等回调传递，比直接在一个类内访问 `this.xxx` 复杂 5 倍
4. **无法享受 NestJS DI**：这些 handler 不是 NestJS Provider，无法被其他模块独立注入，拆分没有带来复用价值

**改造目标**：19 个文件 → ~5 个文件，消除 setup 代理机制

---

### P1: StoreService 是 God Service（较严重）

**现状**：572 行的 `StoreService` 承担了 4 类职责：

| 职责 | 方法数 |
|------|--------|
| 全局配置 CRUD（密码、UI、远程登录密钥、离线提醒） | ~12 |
| 账号配置 CRUD（策略、自动化、间隔、黑名单、肥料…） | ~15 |
| 账号 CRUD（增删改查、uin 去重） | ~7 |
| normalize 工具函数（intervals、fertilizer、bagSeedPriority…） | ~6 |

**问题**：

1. 违反单一职责，任何配置变更都要改这个文件
2. normalize 逻辑（数据校验/转换）混在持久化层里
3. `addOrUpdateAccount()` 有复杂的去重和条件更新逻辑，业务逻辑侵入存储层

**改造目标**：拆为 `GlobalConfigService`、`AccountConfigService`、`AccountRepository`，normalize 提取到 `config-normalizer.ts`

---

### P2: @Global() 模块过多（中等）

**现状**：5 个 `@Global()` 模块：

- DatabaseModule ✅ 合理
- TransportModule ✅ 合理
- StoreModule ❌ 不必要
- GameModule ❌ 不必要
- AccountModule ❌ 不必要

**问题**：几乎所有服务在任何地方都可注入，削弱了 NestJS 模块系统的依赖隔离能力，难以通过模块边界发现不合理的依赖。

**改造目标**：只保留 DatabaseModule + TransportModule 为 Global，其余显式 imports

---

### P3: 目录结构微调（轻微）

| 问题 | 位置 | 建议 |
|------|------|------|
| `common/` 是万能垃圾桶 | decorators, filters, guards, interceptors | 将 guard/filter/interceptor 移入对应模块 |
| `qr/` 模块太小 | 仅 module + controller | 合入 `auth/` 模块 |

---

## 三、值得肯定的设计

1. **Link/Core 分离架构**：游戏连接独立进程，Core 重启不断线
2. **Worker 模式**：每账号 8 个 worker 各司其职，职责边界清晰
3. **GameSession 状态管理**：LandsState/BagState/UserState 封装合理，单线程队列避免竞态
4. **EventEmitter 使用**：账号生命周期事件驱动推送更新，解耦合理
5. **WsRouterService**：基于 DiscoveryService 的自定义 WebSocket 路由，灵活且实用
6. **AppModule 干净**：没有多余胶水代码

---

## 四、改造计划

| 阶段 | 优先级 | 改造项 | 预期收益 |
|------|--------|--------|----------|
| 1 | P0 | 合并 AccountRunner handler（19→5 文件） | 大幅降低认知负担，消除 any 类型代理 |
| 2 | P1 | 拆分 StoreService → 3 个服务 + 1 个工具文件 | 单一职责，减少改动影响面 |
| 3 | P2 | 减少 @Global() 模块（5→2） | 恢复 NestJS 依赖隔离 |
| 4 | P3 | 目录结构微调（qr 合入 auth、common 分散） | 规范化 |

每个阶段完成后验证 `pnpm build:core` 通过。

---

## 五、改造执行记录

### P0: AccountRunner handler 合并 ✅

- 将 14 个 handler 文件合并回 `account-runner.ts` 主类（~930 行），消除 `setupAccountRunner()` / `createAccountRunnerHandlers()` 代理机制
- 保留 `runner-scheduler.ts`、`runner-daily.ts`、`worker-factory.ts`、`account-runner.factory.ts` 4 个独立职责文件
- 结果：19 文件 → 5 文件，消除全部 `any` 类型代理和回调地狱
- ✅ `pnpm build:core` 通过

### P1: StoreService 拆分 ✅

- 拆为 `GlobalConfigService`（全局配置）、`AccountConfigService`（账号配置）、`AccountRepository`（账号 CRUD）
- 提取 `config-normalizer.ts` 纯函数模块
- `store.service.ts` 改为 barrel re-export
- 更新 21 个消费方文件的 import 和注入
- ✅ `pnpm build:core` 通过

### P2: 减少 @Global() 模块 ✅

- 移除 `StoreModule`、`GameModule`、`AccountModule` 的 `@Global()` 装饰器
- 在 `DeviceModule`、`AccountModule`、`QrModule`、`RealtimeModule` 中显式声明 `imports`
- 结果：`@Global()` 模块从 5 个减少到 2 个（DatabaseModule + TransportModule）
- ✅ `pnpm build:core` 通过

### P3: 目录结构微调 ✅

- `qr/` 模块合入 `auth/`：`QrController` 移至 `auth/qr.controller.ts`，`AuthModule` 引入 `GameModule` 并注册 `QrController`，删除 `QrModule`
- `JwtAuthGuard` 从 `common/guards/` 移至 `auth/jwt-auth.guard.ts`（仅 AuthModule 使用），删除空的 `guards/` 目录
- `common/` 保留真正的跨切面关注点：`decorators/`（Public、AccountId）、`filters/`（ApiExceptionFilter）、`interceptors/`（ResponseInterceptor）、`request-intent/`
- ✅ `pnpm build:core` 通过
