# REFACTOR Alignment Design

Date: 2026-03-16

## Goal

Make the running code match `REFACTOR.md` as closely as possible by removing the old `game/account-manager.service.ts` and `game/account-runner.ts` from the runtime path and moving ownership to:

- `account/*` for lifecycle and runner registry
- `account/runner/*` for the runner implementation and scheduling
- `realtime/*` for websocket push and request handling
- `device/*` for per-account device resolution
- `behavior/*` for human-like timing and session behavior

## Chosen Approach

Use a hard cut of the internal runtime architecture while keeping the existing external REST and WS routes stable.

This means:

- keep existing route names like `accounts.start`
- replace their injected services and internal call graph
- stop registering the legacy manager in the active module graph
- move any still-needed behavior into the new services before removing the old path

## Architecture Changes

### Account module

Introduce:

- `AccountLifecycleService`
- `AccountStatusService`
- `account/runner/account-runner.ts`

Responsibilities:

- `AccountLifecycleService`: start/stop/delete/import/rebind/reconnect operations
- `AccountRegistryService`: in-memory runner registry and lookup
- `AccountStatusService`: event listeners, snapshots, realtime push, offline reminder
- `account/runner/account-runner.ts`: lifecycle shell around session, workers, scheduler, daily jobs

### Event model

Replace callback wiring with `EventEmitter2`.

New events:

- `account.status`
- `account.started`
- `account.stopped`
- `account.kicked`
- `account.ws_error`
- `account.data.accounts`
- `account.data.panel`
- `account.data.lands`
- `account.data.bag`
- `account.data.daily_gifts`
- `account.data.friends`
- `account.data.almanac`
- `account.data.strategy`
- `account.data.logs`

### Runner split

Use the already-created but disconnected files:

- `account/runner/account-runner.ts`
- `account/runner/runner-scheduler.ts`
- `account/runner/runner-daily.ts`
- `account/runner/worker-factory.ts`

The new runner will:

- create the transport
- resolve device and behavior dependencies
- construct workers via `worker-factory`
- delegate scheduling to `RunnerScheduler`
- delegate daily jobs to `RunnerDaily`
- emit lifecycle and data events

### Device and behavior

Complete the missing integration:

- persist `deviceProfileId` in account config accessors
- resolve per-account runtime client before connect
- expose behavior config through realtime handlers
- inject `DelayService` and `RhythmService` into game session/workers
- replace direct fallback `sleep()` usage where behavior services are available

### Realtime

Move websocket bootstrapping away from the old manager:

- `RealtimeGateway` only owns auth, router dispatch, and socket server registration
- `AccountStatusService` owns event-to-push mapping through `RealtimePushService`
- handlers depend on `AccountLifecycleService`, `AccountRegistryService`, `StoreService`, and specific feature services

## Migration Sequence

1. Add new account services and runner implementation.
2. Switch `AccountService`, `RealtimeGateway`, and handlers to the new services.
3. Wire account/device/behavior persistence.
4. Update web types and account persistence behavior.
5. Remove legacy providers from the module graph.
6. Build `core`, `link`, and `web` to verify the cut.

## Risks

- runtime regressions in account start/stop/import flow
- websocket push regressions during event migration
- store schema fields existing but not fully read/written today
- behavior integration touching multiple worker paths

## Validation

- `pnpm build:core`
- `pnpm build:link`
- `pnpm build:web`
- spot-check WS handler type errors
- spot-check account lifecycle compile path
