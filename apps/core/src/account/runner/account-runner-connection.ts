import type { ClientConfig } from '@qq-farm/shared/node'
import type { LinkUserState } from '../../game/types'
import type { LinkClientService } from '../../transport/link-client.service'
import type { AccountRunnerConfig } from './account-runner'

export interface AccountRunnerConnectionDeps {
  accountId: string
  linkClient: LinkClientService
  logRestore: () => void
  logStatusError: (error: unknown) => void
}

export class AccountRunnerConnection {
  constructor(private readonly deps: AccountRunnerConnectionDeps) {}

  async resolveUserState(
    startConfig: AccountRunnerConfig,
    currentClientConfig: ClientConfig | undefined,
    forceReconnect = false
  ): Promise<LinkUserState | undefined> {
    if (!forceReconnect) {
      try {
        const meta = await this.deps.linkClient.getAccountStatus(this.deps.accountId)
        if (meta?.connected && meta.userState) {
          this.deps.logRestore()
          return meta.userState
        }
      } catch (error) {
        this.deps.logStatusError(error)
      }
    }

    return this.deps.linkClient.connectAccount(
      this.deps.accountId,
      startConfig.code,
      startConfig.platform,
      currentClientConfig
    )
  }
}
