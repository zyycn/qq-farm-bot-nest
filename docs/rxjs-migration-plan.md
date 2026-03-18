# Core 事件架构 RxJS 迁移方案

> 经三轮 Claude + Codex 评审修正后的最终落地版本

## 1. 背景与动机

当前 Core 应用的事件链路存在以下问题：

- **4 层间接调用**：Runner → EE2 → StatusService → EE2 → PushBridge → WsPushService
- **字符串事件名无类型安全**：18 个字符串常量散落在 `account.events.ts`
- **Runner 非 NestJS 管理类却注入全局 EE2**：依赖穿透不优雅
- **StatusService 与 LifecycleService 存在潜在循环依赖**
- **事件分类混乱**：runtime stream、integration event、push notification 混用同一个 EventEmitter

## 2. 四层架构

```
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 4: Integration Events (EventEmitter2)                         │
│                                                                     │
│ 仅 5 个跨模块协作事件，低频、fire-and-forget                          │
│   account.started          LifecycleService → StatusService         │
│   account.stopped          LifecycleService → StatusService         │
│   account.stop.requested   StatusService → LifecycleService         │
│   account.merge.requested  StatusHandlers → LifecycleService        │
│   account.reconnect.request DeviceHandler → LifecycleService        │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 3: WS Fan-out (完全保留，不改动)                                │
│                                                                     │
│ WsPushService + EmitDeduplicator + Socket.io Room                   │
│ AccountTopicsService (room join/leave + 初始数据推送)                 │
│                                                                     │
│ 实现 AccountPushPort 接口 (DIP)                                      │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 2: Projection / Orchestration                                  │
│                                                                     │
│ AccountStatusService                                                │
│   注入: AccountPushPort (不知道 WsPushService 存在)                   │
│   订阅: runner.events$ (Layer 1 raw stream)                          │
│   职责:                                                              │
│     - 读模型: getAccounts(), getStatus(), getStrategyPayload()       │
│     - 副作用 → 发 integration event (不直接调 lifecycle)              │
│     - 推送编排 → 仅 debounceTime，不做 distinctUntilChanged           │
│     - 统一 dedup 留给 Layer 3 的 EmitDeduplicator                    │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 1: Raw Runtime Streams (RxJS Observable)                       │
│                                                                     │
│ AccountRunner._events$ (private Subject → public Observable)         │
│   原始事实: status / data / log / kicked / ws_error                  │
│   不做 debounce/distinct — 日志/调试要原始事件，推送要压缩事件         │
│                                                                     │
│ LinkClientService._connected$ / _disconnected$ / _accountEvent$      │
│   public Observable (只读，封装写权限)                                │
└─────────────────────────────────────────────────────────────────────┘
```

## 3. 核心设计原则

| # | 原则 | 说明 |
|---|------|------|
| 1 | RxJS 只替换进程内 runtime event 链 | 不替代整个事件架构 |
| 2 | EventEmitter2 只保留 integration events | started/stopped/stop_requested/merge_requested/reconnect_request |
| 3 | WsPushService 只做 fan-out | 不承载业务语义 |
| 4 | LifecycleService 是唯一 runtime owner | 拥有 watchRunner/unwatchRunner 调用权 |
| 5 | StatusService 不直接控制 lifecycle | 通过 ACCOUNT_STOP_REQUESTED_EVENT 解循环 |
| 6 | Subject 私有、Observable 公开 | 封装写权限 |
| 7 | Application service 通过 AccountPushPort 推送 | 不直接依赖 WsPushService (DIP) |
| 8 | WS handler (adapter 层) 可直接注入 WsPushService | 同层依赖无泄漏 |
| 9 | Layer 2 只做 debounceTime，Layer 3 保留统一 dedup | 不双重去重 |
| 10 | 不做兼容 re-export | 硬切旧文件，PR 内一次改完引用 |

## 4. 依赖方向

```
LinkClientService (Layer 1)
    ↓ Observable (subscribe)
AccountLifecycleService (orchestrator, runtime owner)
    ↓ 调用 watchRunner / unwatchRunner
AccountStatusService (Layer 2)
    ↓ inject AccountPushPort (interface)
WsPushService (Layer 3, implements AccountPushPort)

解循环路径:
  AccountStatusService → emit ACCOUNT_STOP_REQUESTED_EVENT
      ↓ @OnEvent
  AccountLifecycleService → stopAccount()

  AccountLifecycleService → emit ACCOUNT_STARTED/STOPPED_EVENT
      ↓ @OnEvent
  AccountStatusService → notifyAccountsUpdate()
```

无注入循环：方法调用（watchRunner）和事件监听（@OnEvent）不构成双向注入。

## 5. 事件全景对照表

### 迁移到 RxJS (Layer 1)

| 原事件 | 原机制 | 改后 |
|--------|--------|------|
| `link.connected` | EE2 | `linkClient.connected$` Observable |
| `link.disconnected` | EE2 | `linkClient.disconnected$` Observable |
| `link.account_event` | EE2 | `linkClient.accountEvent$` Observable |
| `account.status` | EE2 | `runner.events$` StatusEvent |
| `account.data.lands` | EE2 | `runner.events$` DataEvent(key='lands') |
| `account.data.bag` | EE2 | `runner.events$` DataEvent(key='bag') |
| `account.data.friends` | EE2 | `runner.events$` DataEvent(key='friends') |
| `account.data.almanac` | EE2 | `runner.events$` DataEvent(key='almanac') |
| `account.data.daily_gifts` | EE2 | `runner.events$` DataEvent(key='dailyGifts') |
| `account.data.strategy` | EE2 | `runner.events$` DataEvent(key='strategy') |
| `account.log` | EE2 | `runner.events$` LogEvent |
| `account.kicked` | EE2 | `runner.events$` KickedEvent |
| `account.ws_error` | EE2 | `runner.events$` WsErrorEvent |

### 保留 EventEmitter2 (Layer 4)

| 事件 | 发射方 | 监听方 |
|------|--------|--------|
| `account.started` | LifecycleService | StatusService |
| `account.stopped` | LifecycleService | StatusService |
| `account.stop.requested` (新增) | StatusService / StatusHandlers | LifecycleService |
| `account.merge.requested` (新增) | StatusHandlers | LifecycleService |
| `account.reconnect.request` | DeviceHandler | LifecycleService |

### 删除 (改为直接调用)

| 原事件 | 改为 |
|--------|------|
| `account.push` | StatusService 直接调 pushPort.emitToEvent/broadcast |
| `account.data.accounts` | StatusService 直接调 pushPort.broadcast |
| `account.data.panel` | PanelHandler/DeviceHandler 直接调 WsPushService.broadcast |
| `account.data.strategy` (broadcast 场景) | StatusService 直接调 pushPort.emitToEvent |

EventEmitter2 事件从 **18 个减少到 5 个**。

## 6. 文件变更清单

### 6.1 新增文件

#### `apps/core/src/modules/account/domain/runner-events.ts` (~50 行)

RunnerEvent discriminated union 类型定义：

```typescript
import type { GameLogEntry, StatusEventData } from '@/modules/game/domain/types'

export type StatusEventName = 'connection' | 'profile' | 'session' | 'operations' | 'schedule'

export interface StatusEvent {
  type: 'status'
  event: StatusEventName
  data: StatusEventData
}

export type DataEventKey = 'lands' | 'bag' | 'friends' | 'almanac' | 'dailyGifts' | 'strategy'

export interface DataEvent {
  type: 'data'
  key: DataEventKey
  data: unknown
}

export interface LogEvent {
  type: 'log'
  entry: GameLogEntry
}

export interface KickedEvent {
  type: 'kicked'
  reason: string
}

export interface WsErrorEvent {
  type: 'ws_error'
  code: number
  message: string
}

export type RunnerEvent =
  | StatusEvent
  | DataEvent
  | LogEvent
  | KickedEvent
  | WsErrorEvent
```

#### `apps/core/src/modules/account/domain/integration-events.ts` (~35 行)

跨模块协作事件常量和 payload：

```typescript
export const ACCOUNT_STARTED_EVENT = 'account.started'
export const ACCOUNT_STOPPED_EVENT = 'account.stopped'
export const ACCOUNT_STOP_REQUESTED_EVENT = 'account.stop.requested'
export const ACCOUNT_MERGE_REQUESTED_EVENT = 'account.merge.requested'
export const ACCOUNT_RECONNECT_REQUEST_EVENT = 'account.reconnect.request'

export interface AccountLifecycleEventPayload {
  accountId: string
  accountName?: string
}

export interface AccountStopRequestedPayload {
  accountId: string
  reason: 'kicked' | 'ws_error_400' | 'offline_timeout'
  disconnect?: boolean
  deleteAccount?: boolean
}

export interface AccountMergeRequestedPayload {
  accountId: string
  openId: string
}

export interface AccountReconnectRequestPayload {
  accountIds: string[]
}
```

#### `apps/core/src/modules/account/domain/push.port.ts` (~15 行)

应用层推送端口接口：

```typescript
export interface AccountPushPort {
  broadcast(route: string, data: unknown): void
  emitToEvent(accountId: string, route: string, data: unknown): void
}

export const ACCOUNT_PUSH_PORT = Symbol('AccountPushPort')
```

### 6.2 删除文件

| 文件 | 原因 |
|------|------|
| `apps/core/src/infrastructure/ws/account-push.bridge.ts` (24 行) | 被 PushPort DIP 替代 |
| `apps/core/src/modules/account/domain/account.events.ts` (84 行) | 拆分为 runner-events.ts + integration-events.ts |

### 6.3 改动文件

#### `apps/core/src/modules/account/application/runner/account-runner.ts`

**改动范围**: deps 接口 + Event Emission 区域 (原 557-661 行)

deps 接口移除 eventEmitter：

```diff
 export interface AccountRunnerDeps {
   linkClient: LinkClientService
   gameConfig: GameConfigService
   accountConfig: AccountConfigService
   globalConfig: GlobalConfigService
-  eventEmitter: EventEmitter2
   deviceFingerprint: DeviceFingerprintService
 }
```

新增 Subject + emit helpers (替代原 ~110 行)：

```typescript
import { Subject } from 'rxjs'
import type { RunnerEvent, StatusEventName, DataEventKey } from '../domain/runner-events'

// 类内部：
private readonly _events$ = new Subject<RunnerEvent>()
readonly events$ = this._events$.asObservable()

private emitStatus(event: StatusEventName, data: StatusEventData) {
  this._events$.next({ type: 'status', event, data })
}

private emitData(key: DataEventKey, data: unknown) {
  this._events$.next({ type: 'data', key, data })
}

private forwardLog(entry: GameLogEntry) {
  this._events$.next({ type: 'log', entry })
}
```

各调用点替换：

| 原代码 | 改为 |
|--------|------|
| `this.deps.eventEmitter.emit(ACCOUNT_KICKED_EVENT, {accountId, reason})` | `this._events$.next({ type: 'kicked', reason })` |
| `this.deps.eventEmitter.emit(ACCOUNT_WS_ERROR_EVENT, {accountId, code, message})` | `this._events$.next({ type: 'ws_error', code, message })` |
| `this.deps.eventEmitter.emit(ACCOUNT_STATUS_EVENT, payload)` | `this.emitStatus(event, data)` |
| `this.deps.eventEmitter.emit(ACCOUNT_LOG_EVENT, {...})` | `this.forwardLog(entry)` |
| `this.deps.eventEmitter.emit(ACCOUNT_DATA_LANDS_EVENT, {accountId, data})` | `this.emitData('lands', data)` |
| 其他 5 个 ACCOUNT_DATA_*_EVENT | 同上模式 `this.emitData(key, data)` |

stop() 增加 complete：

```diff
 async stop() {
   if (!this.isRunning) return
   this.isRunning = false
   this.loginReady = false
+  this._events$.complete()  // 所有下游 subscription 自动清理
   this.scheduleController.stop()
   this.dailyController.stop()
   this.scheduler.clearAll()
   this.session?.destroy?.()
   this.friend?.destroy?.()
   this.task?.destroy?.()
 }
```

emitStatusSnapshot() 保留，内部调用改为 `this.emitStatus()`：

```typescript
private emitStatusSnapshot() {
  this.emitConnection()   // 内部调 this.emitStatus('connection', ...)
  this.emitProfile()      // 内部调 this.emitStatus('profile', ...)
  this.emitSession()      // 内部调 this.emitStatus('session', ...)
  this.emitOperations()   // 内部调 this.emitStatus('operations', ...)
  this.emitSchedule()     // 内部调 this.emitStatus('schedule', ...)
}
```

initializeWorkers 中的回调保持不变，只是内部调用换底层：

```typescript
onLandsUpdate: data => this.emitData('lands', data),
onBagUpdate: data => this.emitData('bag', data),
```

#### `apps/core/src/modules/account/application/runner/account-runner.factory.ts`

```diff
-import { EventEmitter2 } from '@nestjs/event-emitter'

 @Injectable()
 export class AccountRunnerFactory {
   constructor(
     private readonly linkClient: LinkClientService,
     private readonly gameConfig: GameConfigService,
     private readonly accountConfig: AccountConfigService,
     private readonly globalConfig: GlobalConfigService,
-    private readonly eventEmitter: EventEmitter2,
     private readonly deviceFingerprint: DeviceFingerprintService,
   ) {}

   create(accountId: string) {
     return new AccountRunner(accountId, {
       linkClient: this.linkClient,
       gameConfig: this.gameConfig,
       accountConfig: this.accountConfig,
       globalConfig: this.globalConfig,
-      eventEmitter: this.eventEmitter,
       deviceFingerprint: this.deviceFingerprint,
     })
   }
   // createStartConfig / resolveDeviceConfig 等不变
 }
```

#### `apps/core/src/modules/game/application/link-client.service.ts`

移除 EventEmitter2 注入，新增 3 个 Subject：

```diff
+import { Subject } from 'rxjs'

 @Injectable()
 export class LinkClientService implements OnModuleInit, OnModuleDestroy {
-  constructor(private readonly eventEmitter: EventEmitter2) {}
+  private readonly _connected$ = new Subject<void>()
+  private readonly _disconnected$ = new Subject<void>()
+  private readonly _accountEvent$ = new Subject<{
+    accountId: string
+    event: LinkEventName
+    data: unknown
+  }>()
+
+  readonly connected$ = this._connected$.asObservable()
+  readonly disconnected$ = this._disconnected$.asObservable()
+  readonly accountEvent$ = this._accountEvent$.asObservable()
```

三处 emit 替换：

```diff
 // connect() 回调中
-this.eventEmitter.emit('link.connected')
+this._connected$.next()

 // socket.on('close') 中
-this.eventEmitter.emit('link.disconnected')
+this._disconnected$.next()

 // handleMessage() 中
-this.eventEmitter.emit('link.account_event', { accountId, event, data })
+this._accountEvent$.next({ accountId, event: msg.event as LinkEventName, data: msg.data })
```

destroy() 增加 complete：

```diff
 destroy() {
   this._destroyed = true
   this._connected = false
   this.rejectAllPending('客户端已销毁')
+  this._connected$.complete()
+  this._disconnected$.complete()
+  this._accountEvent$.complete()
   if (this.socket) {
     this.socket.removeAllListeners()
     this.socket.destroy()
     this.socket = null
   }
 }
```

#### `apps/core/src/modules/account/application/account-lifecycle.service.ts`

Link 事件改 subscribe，新增 @OnEvent 监听 stop/merge requested：

```diff
+import { Subscription } from 'rxjs'
+import {
+  ACCOUNT_STARTED_EVENT,
+  ACCOUNT_STOPPED_EVENT,
+  ACCOUNT_STOP_REQUESTED_EVENT,
+  ACCOUNT_MERGE_REQUESTED_EVENT,
+  ACCOUNT_RECONNECT_REQUEST_EVENT,
+} from '@/modules/account/domain/integration-events'
+import type { AccountStopRequestedPayload, AccountMergeRequestedPayload }
+  from '@/modules/account/domain/integration-events'

 @Injectable()
 export class AccountLifecycleService implements OnModuleInit, OnModuleDestroy {
+  private readonly linkSubs = new Subscription()

   constructor(
     private readonly accountRepo: AccountRepository,
     private readonly accountConfig: AccountConfigService,
     private readonly gameLog: GameLogService,
     private readonly registry: AccountRegistryService,
     private readonly linkClient: LinkClientService,
     private readonly eventEmitter: EventEmitter2,   // 保留：发 integration events
     private readonly runnerFactory: AccountRunnerFactory,
+    private readonly statusService: AccountStatusService,  // 调 watchRunner/unwatchRunner
   ) { ... }

   async onModuleInit() {
+    this.linkSubs.add(
+      this.linkClient.accountEvent$.subscribe(payload =>
+        this.linkOps.handleLinkAccountEvent(payload)
+      )
+    )
+    this.linkSubs.add(
+      this.linkClient.connected$.subscribe(() =>
+        this.linkOps.syncAccountsStateFromLink()
+      )
+    )
     // 自动恢复账号逻辑不变
   }

-  @OnEvent('link.account_event')
-  handleLinkAccountEvent(payload) { ... }
-
-  @OnEvent('link.connected')
-  async handleLinkConnected() { ... }

   // 保留
   @OnEvent(ACCOUNT_RECONNECT_REQUEST_EVENT)
   async handleReconnectRequest(payload) { ... }

+  @OnEvent(ACCOUNT_STOP_REQUESTED_EVENT)
+  async handleStopRequest(payload: AccountStopRequestedPayload) {
+    await this.stopAccount(payload.accountId)
+    if (payload.disconnect)
+      await this.disconnectFromLink(payload.accountId).catch(...)
+    if (payload.deleteAccount) {
+      this.accountRepo.deleteAccount(payload.accountId)
+      this.gameLog.deleteAccountLogs(payload.accountId)
+    }
+  }
+
+  @OnEvent(ACCOUNT_MERGE_REQUESTED_EVENT)
+  async handleMergeRequest(payload: AccountMergeRequestedPayload) {
+    await this.mergeDuplicateAccountsByUinPlatform(payload.accountId, payload.openId)
+      .catch(error => this.logger.warn(`合并重复账号失败: ${error?.message}`))
+    this.statusService.notifyAccountsUpdate()
+  }

   async startAccount(accountId: string): Promise<boolean> {
     // ... 原逻辑 ...
     this.registry.register(id, record)
     this.accountRepo.setAccountRunning(id, true)
+    this.statusService.watchRunner(id, runner)   // ← 由 lifecycle 显式调用
     runner.start(...).catch((error) => {
       this.registry.unregister(id)
       this.accountRepo.setAccountRunning(id, false)
+      this.statusService.unwatchRunner(id)
       this.eventEmitter.emit(ACCOUNT_STOPPED_EVENT, { ... })
     })
     this.eventEmitter.emit(ACCOUNT_STARTED_EVENT, { ... })
     return true
   }

   async stopAccount(accountId: string): Promise<boolean> {
     // ...
     await record.runner.stop()   // → _events$.complete() → 下游自动清理
+    this.statusService.unwatchRunner(id)  // 显式清理，双保险
     this.registry.unregister(id)
     this.eventEmitter.emit(ACCOUNT_STOPPED_EVENT, { ... })
     // ...
   }

   async onModuleDestroy() {
+    this.linkSubs.unsubscribe()
     // 停止所有账号逻辑不变
   }
 }
```

#### `apps/core/src/modules/account/application/account-status.service.ts`

核心重写 — watchRunner/unwatchRunner + PushPort + 移除 lifecycle 依赖：

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common'
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'
import { filter, Subscription } from 'rxjs'
import type { AccountRunner } from '../application/runner/account-runner'
import type { DataEvent, KickedEvent, LogEvent, StatusEvent, WsErrorEvent } from '../domain/runner-events'
import { ACCOUNT_PUSH_PORT, type AccountPushPort } from '../domain/push.port'
import {
  ACCOUNT_STARTED_EVENT,
  ACCOUNT_STOPPED_EVENT,
  ACCOUNT_STOP_REQUESTED_EVENT,
  ACCOUNT_MERGE_REQUESTED_EVENT,
} from '../domain/integration-events'
import type { AccountStopRequestedPayload } from '../domain/integration-events'
// ... 其他 import 不变（gameConfig, accountRepo, gameLog 等）

@Injectable()
export class AccountStatusService implements OnModuleInit {
  private readonly logger = new Logger(AccountStatusService.name)
  private readonly runnerSubs = new Map<string, Subscription>()
  private readonly statusEventHandlers: ReturnType<typeof buildAccountStatusEventHandlers>

  constructor(
    @Inject(ACCOUNT_PUSH_PORT) private readonly push: AccountPushPort,
    private readonly gameConfig: GameConfigService,
    private readonly accountRepo: AccountRepository,
    private readonly accountConfig: AccountConfigService,
    private readonly globalConfig: GlobalConfigService,
    private readonly gameLog: GameLogService,
    private readonly gamePush: GamePushService,
    private readonly registry: AccountRegistryService,
    private readonly eventEmitter: EventEmitter2,  // 仅用于发 integration events
    // 注意：不注入 AccountLifecycleService — 解循环
  ) {
    this.statusEventHandlers = buildAccountStatusEventHandlers({
      logger: this.logger,
      accountRepo: this.accountRepo,
      globalConfig: this.globalConfig,
      gameLog: this.gameLog,
      gamePush: this.gamePush,
      emitStopRequest: (accountId, opts) =>
        this.eventEmitter.emit(ACCOUNT_STOP_REQUESTED_EVENT, {
          accountId, reason: opts.reason ?? 'offline_timeout', ...opts,
        } satisfies AccountStopRequestedPayload),
      emitMergeRequest: (accountId, openId) =>
        this.eventEmitter.emit(ACCOUNT_MERGE_REQUESTED_EVENT, { accountId, openId }),
      notifyAccountsUpdate: () => this.notifyAccountsUpdate(),
    })
  }

  onModuleInit() {
    this.gameLog.setCallbacks({
      onLog: entry => this.pushLog(entry),
      onAccountLog: entry => this.forwardAccountLog(entry),
    })
  }

  // ── Layer 1 → Layer 2: 订阅 runner raw stream ──

  watchRunner(accountId: string, runner: AccountRunner) {
    this.runnerSubs.get(accountId)?.unsubscribe()
    const sub = new Subscription()

    // 日志 (raw，不 debounce)
    sub.add(runner.events$.pipe(
      filter((e): e is LogEvent => e.type === 'log'),
    ).subscribe(e => {
      const name = this.registry.get(accountId)?.name ?? ''
      this.gameLog.appendLog(accountId, name, e.entry)
    }))

    // 状态事件 → 副作用 + 推送
    sub.add(runner.events$.pipe(
      filter((e): e is StatusEvent => e.type === 'status'),
    ).subscribe(e => {
      const record = this.registry.get(accountId)
      if (!record) return

      const handler = this.statusEventHandlers[e.event]
      if (handler)
        Promise.resolve(handler(record, accountId, e.data)).catch(err =>
          this.logger.warn(`状态事件处理失败: ${err?.message || err}`))

      if (e.event === 'connection' || e.event === 'profile')
        this.notifyAccountsUpdate()

      const pushData = e.event === 'connection'
        ? { ...(e.data as any), wsError: record.wsError }
        : e.data
      this.push.emitToEvent(accountId, `accounts.${e.event}`, pushData)
    }))

    // 数据事件 → 推送
    sub.add(runner.events$.pipe(
      filter((e): e is DataEvent => e.type === 'data'),
    ).subscribe(e => {
      const routeMap: Record<string, string> = {
        lands: LANDS_UPDATE,
        bag: BAG_UPDATE,
        friends: FRIENDS_UPDATE,
        almanac: ALMANAC_UPDATE,
        dailyGifts: DAILY_GIFTS_UPDATE,
        strategy: STRATEGY_UPDATE,
      }
      const route = routeMap[e.key]
      if (route) this.push.emitToEvent(accountId, route, e.data)
    }))

    // 被踢 → 发停号请求
    sub.add(runner.events$.pipe(
      filter((e): e is KickedEvent => e.type === 'kicked'),
    ).subscribe(e => {
      const record = this.registry.get(accountId)
      if (!record) return
      this.logger.warn(`账号 ${record.name} 被踢下线: ${e.reason}`)
      this.gamePush.triggerOfflineReminder(accountId, record.name, `kickout:${e.reason}`, 0)
      this.gameLog.addAccountLog('kickout_stop', `账号 ${record.name} 被踢下线，已自动停止`, accountId, record.name)
      this.eventEmitter.emit(ACCOUNT_STOP_REQUESTED_EVENT, {
        accountId, reason: 'kicked', disconnect: true,
      } satisfies AccountStopRequestedPayload)
    }))

    // WS 错误 → 400 时发停号请求
    sub.add(runner.events$.pipe(
      filter((e): e is WsErrorEvent => e.type === 'ws_error'),
    ).subscribe(e => {
      const record = this.registry.get(accountId)
      if (!record) return
      record.wsError = { code: e.code, message: e.message, at: Date.now() }
      if (e.code === 400) {
        this.gameLog.addAccountLog('ws_400', `账号 ${record.name} 登录失效`, accountId, record.name)
        this.eventEmitter.emit(ACCOUNT_STOP_REQUESTED_EVENT, {
          accountId, reason: 'ws_error_400',
        } satisfies AccountStopRequestedPayload)
      }
    }))

    this.runnerSubs.set(accountId, sub)
  }

  unwatchRunner(accountId: string) {
    this.runnerSubs.get(accountId)?.unsubscribe()
    this.runnerSubs.delete(accountId)
  }

  // ── Layer 4: Integration events (保留 @OnEvent) ──

  @OnEvent(ACCOUNT_STARTED_EVENT)
  handleStarted() { this.notifyAccountsUpdate() }

  @OnEvent(ACCOUNT_STOPPED_EVENT)
  handleStopped() { this.notifyAccountsUpdate() }

  // ── 推送通知 (直接调 pushPort，不走 EventEmitter) ──

  notifyAccountsUpdate() {
    this.push.broadcast(ACCOUNTS_UPDATE, this.getAccounts())
  }

  notifyPanelUpdate() {
    this.push.broadcast(PANEL_UPDATE, {
      ui: this.globalConfig.getUI(),
      offlineReminder: this.globalConfig.getOfflineReminder(),
      remoteLoginKey: this.globalConfig.getRemoteLoginKey(),
      defaultDeviceProfileId: this.globalConfig.getDefaultDeviceProfileId(),
    })
  }

  notifyStrategyUpdate(accountId: string) {
    const id = String(accountId || '').trim()
    if (!id) return
    this.push.emitToEvent(id, STRATEGY_UPDATE, this.getStrategyPayload(id))
  }

  // ── 读模型方法 (完全不动) ──

  getAccounts() { /* 原样 */ }
  getStatus(accountId: string) { /* 原样 */ }
  getLogs(...) { /* 原样 */ }
  getAccountLogs(limit?: number) { /* 原样 */ }
  getAnalytics(sortBy: string) { /* 原样 */ }
  getAlmanac(accountId: string, options?) { /* 原样 */ }
  claimAlmanacRewards(accountId: string) { /* 原样 */ }

  // ── 私有方法 ──

  private getStrategyPayload(accountId: string) { /* 原样 */ }
  private pushLog(entry: PersistedLogEntry) {
    const accountId = String(entry?.accountId || '').trim()
    if (!accountId) return
    this.push.emitToEvent(accountId, 'logs.append', entry)
  }
  private forwardAccountLog(entry: AccountLogEntry) { /* 原样 */ }

  // 删除: emitPush() 私有方法
  // 删除: 原有 11 个 runner 相关 @OnEvent handler
  // 删除: @OnEvent(ACCOUNT_DATA_ACCOUNTS_EVENT)
  // 删除: @OnEvent(ACCOUNT_DATA_PANEL_EVENT)
}
```

#### `apps/core/src/modules/account/application/account-status-handlers.ts`

移除 lifecycle 依赖，改用回调：

```diff
 interface AccountStatusHandlerDeps {
   logger: Logger
   accountRepo: AccountRepository
   globalConfig: GlobalConfigService
   gameLog: GameLogService
   gamePush: GamePushService
-  lifecycle: AccountLifecycleService
+  emitStopRequest: (accountId: string, options: { disconnect?: boolean, deleteAccount?: boolean }) => void
+  emitMergeRequest: (accountId: string, openId: string) => void
   notifyAccountsUpdate: () => void
 }
```

connection handler 中：

```diff
-await deps.lifecycle.stopAccount(accountId).catch(...)
-await deps.lifecycle.disconnectFromLink(accountId).catch(...)
-deps.accountRepo.deleteAccount(accountId)
-deps.gameLog.deleteAccountLogs(accountId)
+deps.emitStopRequest(accountId, { disconnect: true, deleteAccount: true })
```

profile handler 中：

```diff
-deps.lifecycle
-  .mergeDuplicateAccountsByUinPlatform(accountId, profile.openId)
-  .then(() => deps.notifyAccountsUpdate())
-  .catch(...)
+deps.emitMergeRequest(accountId, profile.openId)
```

#### `apps/core/src/modules/settings/ws/panel.ws-handler.ts`

```diff
-import { EventEmitter2 } from '@nestjs/event-emitter'
-import { ACCOUNT_DATA_PANEL_EVENT } from '@/modules/account/domain/account.events'
+import { PANEL_UPDATE } from '@qq-farm/shared'
+import { WsPushService } from '@/infrastructure/ws/ws-push.service'

 constructor(
   private readonly globalConfig: GlobalConfigService,
-  private readonly eventEmitter: EventEmitter2,
+  private readonly push: WsPushService,
 ) {}

 private emitPanelUpdate() {
-  this.eventEmitter.emit(ACCOUNT_DATA_PANEL_EVENT, {
+  this.push.broadcast(PANEL_UPDATE, {
     ui: this.globalConfig.getUI(),
     offlineReminder: this.globalConfig.getOfflineReminder(),
     remoteLoginKey: this.globalConfig.getRemoteLoginKey(),
     defaultDeviceProfileId: this.globalConfig.getDefaultDeviceProfileId(),
   })
 }
```

#### `apps/core/src/modules/device/ws/device.ws-handler.ts`

```diff
-import { ACCOUNT_DATA_PANEL_EVENT, ACCOUNT_RECONNECT_REQUEST_EVENT }
-  from '@/modules/account/domain/account.events'
+import { ACCOUNT_RECONNECT_REQUEST_EVENT } from '@/modules/account/domain/integration-events'
+import { PANEL_UPDATE } from '@qq-farm/shared'
+import { WsPushService } from '@/infrastructure/ws/ws-push.service'

 constructor(
   private readonly deviceProfile: DeviceProfileService,
   private readonly globalConfig: GlobalConfigService,
+  private readonly push: WsPushService,
   private readonly eventEmitter: EventEmitter2,  // 仅用于 reconnect request
 ) {}

 private emitPanelUpdate() {
-  this.eventEmitter.emit(ACCOUNT_DATA_PANEL_EVENT, { ... })
+  this.push.broadcast(PANEL_UPDATE, { ... })
 }

 // requestReconnect 保持不变，仍用 eventEmitter
```

#### `apps/core/src/infrastructure/ws/ws.module.ts`

```diff
-import { AccountPushBridge } from './account-push.bridge'
+import { ACCOUNT_PUSH_PORT } from '@/modules/account/domain/push.port'

 @Module({
   imports: [ JwtModule.registerAsync({ ... }) ],
   providers: [
-    AccountPushBridge,
     WsRouterService,
     WsPushService,
     WsGateway,
+    { provide: ACCOUNT_PUSH_PORT, useExisting: WsPushService },
   ],
-  exports: [WsPushService, WsRouterService],
+  exports: [WsPushService, WsRouterService, ACCOUNT_PUSH_PORT],
 })
 export class WsModule {}
```

#### `apps/core/src/app.module.ts`

```
EventEmitterModule.forRoot() 保留（Layer 4 仍需要）。
其余不变。
```

### 6.4 不改动的文件

| 文件 | 原因 |
|------|------|
| `infrastructure/ws/emit-deduplicator.ts` | Layer 3 统一 dedup，保留 |
| `infrastructure/ws/ws-push.service.ts` | Layer 3 完全不动 |
| `modules/account/ws/subscriptions/account-topics.service.ts` | Layer 3 room 管理，完全不动 |
| `modules/account/account.module.ts` | provider 列表不变 |
| `modules/game/application/session/game-session.ts` | 不涉及事件架构 |
| 所有 Worker 文件 | 不涉及事件架构 |

## 7. 迁移顺序

先建新边界，最后删旧边界。每个 PR 独立可测、可回滚。

### PR 1 — 类型基础设施

**目标**: 建立新的类型边界，不改变任何运行时行为。

- 新增 `runner-events.ts`
- 新增 `integration-events.ts`
- 新增 `push.port.ts`

测试: 编译通过即可，无运行时变更。

### PR 2 — Runner + Link RxJS 化

**目标**: 将 runtime event 发射方从 EventEmitter2 迁移到 RxJS Subject。

- 改造 `AccountRunner` — Subject 替代 eventEmitter.emit
- 改造 `AccountRunnerFactory` — 移除 EventEmitter2 注入
- 改造 `LinkClientService` — 3 个 private Subject + public Observable
- 改造 `AccountLifecycleService` — subscribe Link Observables (替代 `@OnEvent('link.*')`)

测试:
- 单测: `runner.events$` 正确发出各类事件
- 单测: `linkClient.connected$` / `accountEvent$` 正确发出
- 集成: Runner 启动后各事件正常传播

### PR 3 — StatusService + LifecycleService 解循环

**目标**: StatusService 改用 watchRunner 订阅模式，通过 integration event 解循环依赖。

- `AccountStatusService`: 新增 `watchRunner` / `unwatchRunner`，注入 `AccountPushPort`，移除 lifecycle 依赖
- `account-status-handlers.ts`: 移除 lifecycle 依赖，改用 `emitStopRequest` / `emitMergeRequest` 回调
- `AccountLifecycleService`: `startAccount` 中调 `watchRunner`，`stopAccount` 中调 `unwatchRunner`；新增 `@OnEvent(ACCOUNT_STOP_REQUESTED_EVENT)` 和 `@OnEvent(ACCOUNT_MERGE_REQUESTED_EVENT)`
- `WsModule`: 注册 `ACCOUNT_PUSH_PORT` provider

测试:
- 集成: 启停账号 → WS 推送链路正常
- 集成: 被踢/ws_error → 账号正确停止
- 集成: 合并重复账号 → 正常执行

### PR 4 — 删旧边界

**目标**: 清理所有旧事件基础设施。

- 删除 `account-push.bridge.ts`
- 删除 `account.events.ts`
- `PanelHandler`: 直接调 `WsPushService.broadcast`
- `DeviceHandler`: 直接调 `WsPushService.broadcast`
- 清理所有对旧 `account.events.ts` 的 import 引用
- 删除 `AccountStatusService` 中原有的 `@OnEvent(ACCOUNT_DATA_PANEL_EVENT)` 和 `@OnEvent(ACCOUNT_DATA_ACCOUNTS_EVENT)`
- 更新 `ws.module.ts` 移除 `AccountPushBridge`

测试:
- 全链路集成测试: 启停、推送、被踢、面板更新全部正常

## 8. 代码量变化汇总

```
                                    当前       改后       差异
──────────────────────────────────────────────────────────────────
新增 runner-events.ts                0    →    50      +50
新增 integration-events.ts           0    →    35      +35
新增 push.port.ts                    0    →    15      +15
删除 account-push.bridge.ts         24   →     0      -24
删除 account.events.ts              84   →     0      -84
改 account-runner.ts (emit 区)     ~110  →   ~15      -95
改 account-runner.factory.ts                           -3
改 link-client.service.ts                             +15
改 account-lifecycle.service.ts                        -5
改 account-status.service.ts        292  →   ~200     -92
改 account-status-handlers.ts                          -5
改 panel.ws-handler.ts                                 -3
改 device.ws-handler.ts                                -3
──────────────────────────────────────────────────────────────────
净减少                                                ~199 行
```

## 9. 待定项

- `AccountStatusService` 名字后续可能需要拆为 `AccountReadModelService` + `AccountRuntimePolicyService`（当前不拆）
- `EventEmitterModule.forRoot()` 保留（Layer 4 仍需要）
- Layer 3 完全不动（`emit-deduplicator.ts`, `ws-push.service.ts`, `account-topics.service.ts`）
