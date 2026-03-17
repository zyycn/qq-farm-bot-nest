import type { ClientConfig } from '@qq-farm/shared/node'
import type { ResolvedDeviceConfig } from '../../device/device-fingerprint'
import type { LinkEventMap, LinkUserState } from '../../game/types'
import type { AccountRunnerConfig } from './account-runner'
import type { AccountRunnerConnection } from './account-runner-connection'
import type { AccountRunnerLifecycle } from './account-runner-lifecycle'
import type { AccountRunnerLoginReady } from './account-runner-login-ready'
import type { AccountRunnerStarter, PreparedRunnerStart } from './account-runner-starter'
import type { AccountRunnerWorkers } from './account-runner-workers'

function formatDeviceSourceLabel(source: ResolvedDeviceConfig['source']): string {
  switch (source) {
    case 'account_profile':
      return '账号单独指定'
    case 'global_default_profile':
      return '全局默认设备'
    case 'built_in_default_preset':
      return '内置默认预设'
    default:
      return source
  }
}

export interface AccountRunnerRuntimeState {
  isRunning: boolean
  loginReady: boolean
  startConfig: AccountRunnerConfig | null
  pendingScheduleOffsetMs: number
  currentClientConfig: ClientConfig | undefined
  currentDeviceResolution: ResolvedDeviceConfig | undefined
}

export interface AccountRunnerRuntimeDeps {
  state: AccountRunnerRuntimeState
  starterHandler: AccountRunnerStarter
  lifecycleHandler: AccountRunnerLifecycle
  connectionHandler: AccountRunnerConnection
  loginReadyHandler: AccountRunnerLoginReady
  workersHandler: AccountRunnerWorkers
  initializeWorkers: (platform: string) => void
  applyInitialConfig: (snapshot: PreparedRunnerStart['initialConfigSnapshot']) => void
  updateLoginState: (userState: LinkUserState) => void
  log: (msg: string, event?: string) => void
  warn: (msg: string, event?: string) => void
  getDestroyableWorkers: () => {
    session: { destroy?: () => void } | undefined
    friend: { destroy?: () => void } | undefined
    task: { destroy?: () => void } | undefined
  }
}

export class AccountRunnerRuntime {
  constructor(private readonly deps: AccountRunnerRuntimeDeps) {}

  async start(config: AccountRunnerConfig) {
    if (this.deps.state.isRunning)
      return

    const prepared = this.deps.starterHandler.prepare(config)
    this.deps.starterHandler.beginStart(this.deps.state, prepared)

    this.deps.initializeWorkers(config.platform)
    this.deps.applyInitialConfig(prepared.initialConfigSnapshot)

    const device = prepared.currentDeviceResolution
    this.deps.log(
      `启动摘要[设备]: 来源=${formatDeviceSourceLabel(device.source)}; 选中=${device.selectedProfileId || 'preset:iphone-15-pro-max'}; 基底=${device.basePresetId || '-'}; fallback=${device.usedFallback ? '有' : '无'}; 字段=${device.fallbackFields.length ? device.fallbackFields.join('/') : '无'}`,
      'device_resolution'
    )
    this.deps.log('正在连接服务器...', 'connect')

    try {
      await this.deps.starterHandler.applyStartJitter(prepared.startJitterMs)
      if (!this.deps.state.isRunning)
        return
      await this.ensureConnected(true)
    } catch (error: any) {
      this.deps.warn(`连接失败: ${error?.message || error}`, 'connect')
      throw error
    }
  }

  async stop() {
    if (!this.deps.lifecycleHandler.stop(this.deps.state))
      return
    this.deps.workersHandler.destroy(this.deps.getDestroyableWorkers())
  }

  async ensureReady() {
    if (!this.deps.state.isRunning)
      throw new Error('账号未运行')
    if (!this.deps.state.loginReady)
      await this.ensureConnected()
  }

  async ensureConnected(forceReconnect = false) {
    if (!this.deps.state.isRunning)
      return
    if (this.deps.state.loginReady && !forceReconnect)
      return

    const startConfig = this.deps.state.startConfig
    if (!startConfig)
      throw new Error('账号启动参数丢失')

    const userState = await this.deps.connectionHandler.resolveUserState(
      startConfig,
      this.deps.state.currentClientConfig,
      forceReconnect
    )

    if (!this.deps.state.isRunning || !userState)
      return

    await this.onLoginReady(userState)
  }

  async onLoginReady(userState: LinkUserState) {
    this.deps.updateLoginState(userState)
    this.deps.log(`登录成功: ${userState.name || ''} (等级 ${userState.level ?? ''})`, 'login')
    await this.deps.loginReadyHandler.handle(userState)
  }

  onKickout(payload: LinkEventMap['kicked']) {
    const reason = payload.reason || '未知'
    this.deps.warn(`被踢下线: ${reason}`, 'kickout')
  }
}
