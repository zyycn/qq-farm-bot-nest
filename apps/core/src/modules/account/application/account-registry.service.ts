import type { AccountRunner } from '@/modules/account/application/runner/account-runner'
import { BadRequestException, Injectable } from '@nestjs/common'

export interface RunningAccount {
  runner: AccountRunner
  name: string
  disconnectedSince: number
  autoDeleteTriggered: boolean
  wsError: { code: number, message: string, at: number } | null
}

@Injectable()
export class AccountRegistryService {
  private runners = new Map<string, RunningAccount>()
  private lastCodeUsedForConnection = new Map<string, string>()

  register(id: string, record: RunningAccount) {
    this.runners.set(id, record)
  }

  unregister(id: string) {
    this.runners.delete(id)
  }

  get(id: string): RunningAccount | undefined {
    return this.runners.get(id)
  }

  getRunner(id: string): AccountRunner | null {
    return this.runners.get(id)?.runner || null
  }

  getRunnerOrThrow(id: string): AccountRunner {
    const runner = this.getRunner(id)
    if (!runner)
      throw new BadRequestException('账号未运行')
    return runner
  }

  has(id: string): boolean {
    return this.runners.has(id)
  }

  isRunning(id: string): boolean {
    return this.has(id) && !!this.runners.get(id)?.runner.isActive()
  }

  getAllIds(): string[] {
    return [...this.runners.keys()]
  }

  forEach(callback: (record: RunningAccount, id: string) => void) {
    this.runners.forEach((record, id) => callback(record, id))
  }

  getLastCode(id: string): string | undefined {
    return this.lastCodeUsedForConnection.get(id)
  }

  setLastCode(id: string, code: string) {
    this.lastCodeUsedForConnection.set(id, code)
  }

  deleteLastCode(id: string) {
    this.lastCodeUsedForConnection.delete(id)
  }
}
