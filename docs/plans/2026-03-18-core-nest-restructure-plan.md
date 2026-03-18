# Core Nest Recommended Restructure Plan

Date: 2026-03-18
Scope: `apps/core`
Status: In progress

## Goal

Restructure `apps/core` to follow a stricter NestJS architecture:

- feature-first modules
- explicit imports and exports
- infrastructure isolated from business modules
- transport isolated from business logic
- repository boundary enforced
- no legacy runtime path kept alive after migration

This is a hard-cut refactor plan, not a compatibility-layer plan.

## Non-Negotiable Rules

1. No dual runtime path.
   Once a feature is migrated, the old service or module must be removed from the active module graph in the same phase.

2. No compatibility barrels for old paths.
   Do not keep files such as `old-service.ts` that only re-export new implementations.

3. No historical modules kept for convenience.
   `store`, oversized `game`, and centralized business `realtime/handlers` must be dissolved into the target structure.

4. No direct database token injection in feature application services.
   Feature services depend on repositories or feature-owned persistence providers, not `DRIZZLE_TOKEN`.

5. No business `@Global()` modules.
   Only true infrastructure modules may be global, and even that should be minimized.

6. No “move later” leftovers.
   Empty folders, dead providers, old DTOs, unused events, and inactive handlers must be deleted in the same refactor slice that replaces them.

## Target Architecture

```text
apps/core/src/
  main.ts
  app.module.ts

  common/
    decorators/
    filters/
    interceptors/
    pipes/
    constants/

  infrastructure/
    config/
      config.module.ts
      app.config.ts
      env.validation.ts
      paths.ts
    database/
      database.module.ts
      drizzle.provider.ts
      schema/
      migrations/
    ws/
      ws.module.ts
      ws.gateway.ts
      ws-auth.guard.ts
      ws-exception.filter.ts
      ws-response.interceptor.ts

  modules/
    account/
      account.module.ts
      controllers/
      gateways/
      application/
      domain/
      dto/
      repositories/
      events/
    auth/
      auth.module.ts
      controllers/
      application/
      dto/
      repositories/
      strategies/
      guards/
    device/
      device.module.ts
      controllers/
      gateways/
      application/
      dto/
      repositories/
    settings/
      settings.module.ts
      controllers/
      gateways/
      application/
      dto/
      repositories/
    game/
      game.module.ts
      controllers/
      gateways/
      application/
      domain/
      dto/
      repositories/
      workers/
```

## Mapping From Current Structure

### Remove or dissolve

- `src/store`
- current oversized `src/game` module shape
- centralized business handlers in `src/realtime/handlers`
- feature services directly using `DRIZZLE_TOKEN`
- business `@Global()` modules

### Keep but relocate

- `src/common`
- `src/main.ts`
- `src/app.module.ts`
- database provider code, but under `src/infrastructure/database`
- config code, but under `src/infrastructure/config`

### Re-home by ownership

- `account/runner/*` stays with account because it is account runtime orchestration
- `auth/qr.controller.ts` remains under auth, not under game
- `global-config.service.ts` becomes part of `settings`
- `account-config.service.ts` and `account-repository.ts` become part of `account`
- `device-profile.service.ts` remains in device
- `game-log.service.ts` remains in game, but only talks to game-owned persistence

## Module Boundaries

### AccountModule

Owns:

- account CRUD application flows
- account lifecycle
- runner registry
- runner orchestration
- account configuration
- account events

Must not own:

- global system settings
- raw database connection
- websocket transport bootstrapping

### AuthModule

Owns:

- login
- JWT
- password change
- auth guards and strategy
- QR login entry

Must not own:

- direct database token usage in application service
- game transport internals

### DeviceModule

Owns:

- device presets
- device profile CRUD
- device fingerprint resolution

### SettingsModule

Owns:

- admin-facing global settings
- UI theme setting
- remote login key
- offline reminder and similar cross-account settings

### GameModule

Owns:

- game session
- game config
- task workers
- friend logic
- game logs
- game-side domain services

Must not become a global utility bucket.

### Infrastructure WsModule

Owns:

- socket gateway bootstrap
- auth guard hookup
- message envelope
- exception formatting
- low-level socket registration

Must not own:

- business handlers for account, device, settings, or game

Business websocket message handlers should live inside the corresponding feature modules.

## Code Rules For The Refactor

1. One module owns one business capability.
2. One repository owns one aggregate or one clearly bounded persistence concern.
3. Application services orchestrate use cases.
4. Repositories persist and fetch; they do not perform business side effects.
5. DTOs stay at the transport edge.
6. Domain events stay with the owning feature.
7. Transport concerns do not decide business ownership.
8. If a file exists only to preserve an old import path, delete it.

## Execution Plan

### Phase 1: Establish target skeleton and hard boundaries

Status: completed

Tasks:

- create `src/infrastructure`
- create `src/modules`
- move config and database into infrastructure namespaces
- remove business `@Global()` usage
- keep `AppModule` as composition root only

Done when:

- root imports express the target dependency graph
- no business module is global
- project still builds

### Phase 2: Dissolve `store` into feature-owned modules

Status: completed

Tasks:

- move `GlobalConfigService` into `modules/settings`
- move `AccountConfigService` into `modules/account`
- move `AccountRepository` into `modules/account`
- replace `StoreModule` with `SettingsModule` and feature-owned persistence providers
- delete `src/store`

Done when:

- no imports remain from `src/store`
- `StoreModule` no longer exists
- repositories no longer perform cross-feature side effects

### Phase 3: Refactor auth, device, and settings persistence boundaries

Status: completed

Tasks:

- remove direct `DRIZZLE_TOKEN` usage from feature application services
- introduce feature repositories where needed
- keep data access behind repositories
- keep auth QR entry inside auth

Done when:

- feature application services no longer inject `DRIZZLE_TOKEN`
- auth, device, settings each expose only feature-facing providers

### Phase 4: Split game into a real feature module

Status: in progress

Tasks:

- keep game as a business feature, not a shared utility bucket
- split game internal structure into application, domain, repositories, workers
- keep session and worker logic under game ownership
- move game logging to game-owned persistence boundary

Done when:

- `GameModule` exports only explicit business capabilities
- game no longer acts as a global shared-provider module

### Phase 5: Rebuild websocket ownership

Status: completed

Tasks:

- keep gateway bootstrap in infrastructure ws layer
- move business websocket handlers into their feature modules
- remove centralized `realtime/handlers` ownership model
- delete provider-scanning router code if it exists only to support the old central handler model

Done when:

- websocket business entrypoints live with their owning modules
- transport no longer owns account, device, settings, or game behavior

### Phase 6: Delete obsolete code and close the cut

Status: in progress

Tasks:

- remove dead providers
- remove dead modules
- remove unused events and DTOs
- remove empty folders
- remove legacy import paths

Done when:

- no historical code path remains in the runtime graph
- no “temporary” bridge files remain
- build passes cleanly

## Current First Slice

The first execution slice should be structural, not behavioral:

1. create `infrastructure/` and `modules/` namespaces
2. move config and database into infrastructure
3. replace `StoreModule` references with explicit target module plan
4. remove business-global module assumptions

The first slice must not introduce compatibility files to preserve the old tree.

## Progress Snapshot

Completed:

- `src` top-level has been hard-cut to `assets`, `common`, `infrastructure`, `modules`
- config and database code moved under `src/infrastructure`
- `auth`, `device`, `settings`, `account`, `game` moved under `src/modules`
- auth controllers, application services, guard, and strategy moved into `modules/auth/controllers`, `modules/auth/application`, `modules/auth/guards`, and `modules/auth/strategies`
- `src/store` deleted
- old top-level `src/account`, `src/auth`, `src/config`, `src/database`, `src/device`, `src/game`, `src/realtime` deleted
- `GameModule` is no longer global
- `AuthService` no longer injects `DRIZZLE_TOKEN`
- device and settings persistence now sit behind feature-owned repositories/services
- websocket transport moved to `src/infrastructure/ws`
- business websocket handlers moved back into feature modules
- `WsModule` no longer imports account, device, settings, and game as a legacy aggregator
- websocket routes are now registered explicitly by each owning module
- provider-scanning websocket handler discovery removed
- legacy `@WsHandler()` marker deleted
- `QRLoginService` moved from `game` into `auth`
- `GameLogService` no longer injects the database token directly; persistence has started moving into a game-owned repository
- core game services moved under `modules/game/application`
- game constants, types, and utilities moved under `modules/game/domain`
- game rpc, session, and workers moved under `modules/game/application`
- account services moved under `modules/account/application`
- account runner orchestration moved under `modules/account/application/runner`
- account controller moved under `modules/account/controllers`
- account events moved under `modules/account/domain`
- account websocket handlers are now grouped by use case under `modules/account/ws/account`, `modules/account/ws/runtime`, and `modules/account/ws/state`
- device services and repository moved under `modules/device/application` and `modules/device/persistence`
- device presets moved under `modules/device/domain`
- settings service, repository, and normalizer moved under `modules/settings/application`, `modules/settings/persistence`, and `modules/settings/domain`
- auth QR login utilities no longer depend on the game module
- `AuthModule` no longer imports `GameModule`
- unused `common/decorators/account-id.decorator.ts` removed

Still being tightened:

- `common/` should remain only for truly cross-feature concerns

Validation completed so far:

- `pnpm --filter core build`

## Validation Standard

Every phase must finish with:

- compile passing
- imports updated to the new ownership
- old files deleted, not deprecated
- no dead providers left registered

Suggested commands:

- `pnpm --filter @qq-farm/core build`
- `pnpm --filter @qq-farm/core lint`

## Definition of Done

The refactor is done only when all of the following are true:

- `apps/core/src` is organized by `common`, `infrastructure`, and `modules`
- there is no `src/store`
- there is no business `@Global()` module
- business application services do not inject `DRIZZLE_TOKEN`
- websocket business handlers live with their feature modules
- old files are deleted, not kept as shims
