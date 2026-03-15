import type { UserState } from '@qq-farm/shared'
import type { ClientConfig } from '@qq-farm/shared/node'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { CLIENT_VERSION, createEmptyUserState, DEFAULT_DEVICE_ID, DEFAULT_DEVICE_MEMORY, DEFAULT_DEVICE_NETWORK, DEFAULT_DEVICE_SYS_SOFTWARE, DEFAULT_OS, GAME_SERVER_URL, HEARTBEAT_INTERVAL_MS, Scheduler, syncServerTime, toLong, toNum } from '@qq-farm/shared'
import WebSocket from 'ws'
import * as cryptoWasm from './crypto-wasm'

const RE_UNEXPECTED_RESPONSE = /Unexpected server response:\s*(\d+)/i

export type { UserState } from '@qq-farm/shared'

type MessageCallback = (err: Error | null, body?: Buffer, meta?: any) => void

export class GameClient extends EventEmitter {
  private ws: WebSocket | null = null
  private clientSeq = 1
  private serverSeq = 0
  private pendingCallbacks = new Map<number, MessageCallback>()
  readonly scheduler: Scheduler
  readonly userState: UserState = createEmptyUserState()

  private savedCode: string | null = null
  private platform = 'qq'
  private lastHeartbeatResponse = Date.now()
  private heartbeatMissCount = 0
  private lastBcrfTime = 0
  private bcrfWindowStart = 0
  private _connected = false
  private _destroyed = false

  private _reconnectAttempts = 0
  private _loginFailed = false
  private static readonly MAX_RECONNECT_ATTEMPTS = 3

  private _accountId: string
  private cfg: Required<Pick<ClientConfig, 'serverUrl' | 'clientVersion' | 'os'>> & { deviceInfo: { sysSoftware: string, network: string, memory: string, deviceId: string } }

  constructor(
    accountId: string,
    private readonly protoTypes: Record<string, any>,
    clientConfig?: ClientConfig
  ) {
    super()
    this._accountId = accountId
    this.scheduler = new Scheduler(`gc-${accountId}`)
    const c = clientConfig || {}
    const d = c.deviceInfo || {}
    this.cfg = {
      serverUrl: c.serverUrl || GAME_SERVER_URL,
      clientVersion: c.clientVersion || CLIENT_VERSION,
      os: c.os || DEFAULT_OS,
      deviceInfo: {
        sysSoftware: d.sysSoftware || DEFAULT_DEVICE_SYS_SOFTWARE,
        network: d.network || DEFAULT_DEVICE_NETWORK,
        memory: d.memory || DEFAULT_DEVICE_MEMORY,
        deviceId: d.deviceId || `${DEFAULT_DEVICE_ID}<iPhone18,3>`
      }
    }
  }

  get accountId(): string {
    return this._accountId
  }

  set accountId(id: string) {
    this._accountId = id
  }

  get connected(): boolean { return this._connected }
  get destroyed(): boolean { return this._destroyed }

  private async encodeMsg(serviceName: string, methodName: string, bodyBytes: Buffer): Promise<Buffer> {
    let finalBody = bodyBytes || Buffer.alloc(0)
    if (finalBody.length > 0)
      finalBody = await cryptoWasm.encryptBuffer(finalBody)

    const t = this.protoTypes
    const msg = t.GateMessage.create({
      meta: {
        service_name: serviceName,
        method_name: methodName,
        message_type: 1,
        client_seq: toLong(this.clientSeq),
        server_seq: toLong(this.serverSeq)
      },
      body: finalBody
    })
    const encoded = t.GateMessage.encode(msg).finish()
    this.clientSeq++
    return Buffer.from(encoded)
  }

  async sendMsg(serviceName: string, methodName: string, bodyBytes: Buffer, callback?: MessageCallback): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (callback)
        callback(new Error('连接未打开'))
      return false
    }
    const seq = this.clientSeq
    let encoded: Buffer
    try {
      encoded = await this.encodeMsg(serviceName, methodName, bodyBytes)
    } catch (err) {
      if (callback)
        callback(err instanceof Error ? err : new Error(String(err)))
      return false
    }
    if (callback)
      this.pendingCallbacks.set(seq, callback)
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (callback) {
        this.pendingCallbacks.delete(seq)
        callback(new Error('连接已在加密途中关闭'))
      }
      return false
    }
    this.ws.send(encoded)

    // 业务操作后触发 BCRF 去抖调度（排除心跳和 BCRF 自身）
    if (methodName !== 'Heartbeat' && methodName !== 'BatchClientReportFlow' && methodName !== 'Login') {
      this.scheduleBcrf()
    }

    return true
  }

  sendMsgAsync(serviceName: string, methodName: string, bodyBytes: Buffer, timeout = 10000): Promise<{ body: Buffer, meta: any }> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`连接未打开: ${methodName}`))
        return
      }
      const seq = this.clientSeq
      const timeoutKey = `request_timeout_${seq}`
      this.scheduler.setTimeoutTask(timeoutKey, timeout, () => {
        this.pendingCallbacks.delete(seq)
        reject(new Error(`请求超时: ${methodName} (seq=${seq})`))
      })
      this.sendMsg(serviceName, methodName, bodyBytes, (err, body, meta) => {
        this.scheduler.clear(timeoutKey)
        if (err)
          reject(err)
        else resolve({ body: body!, meta })
      }).then((sent) => {
        if (!sent) {
          this.scheduler.clear(timeoutKey)
          reject(new Error(`发送失败: ${methodName}`))
        }
      }).catch((err) => {
        this.scheduler.clear(timeoutKey)
        reject(err)
      })
    })
  }

  private async handleMessage(data: Buffer) {
    const t = this.protoTypes
    let msg: any
    try {
      msg = t.GateMessage.decode(data)
    } catch (err: any) {
      console.warn(`[GameClient:${this.accountId}] 外层 GateMessage 解码失败: ${err?.message}`)
      return
    }

    const meta = msg.meta
    if (!meta)
      return

    if (meta.server_seq) {
      const seq = toNum(meta.server_seq)
      if (seq > this.serverSeq)
        this.serverSeq = seq
    }

    if (meta.message_type === 3) {
      try {
        this.handleNotify(msg)
      } catch (e: any) {
        console.warn(`[GameClient:${this.accountId}] Notify 解码失败: ${e?.message}`)
      }
      return
    }

    if (meta.message_type === 2) {
      const errorCode = toNum(meta.error_code)
      const clientSeqVal = toNum(meta.client_seq)
      const cb = this.pendingCallbacks.get(clientSeqVal)
      if (cb) {
        this.pendingCallbacks.delete(clientSeqVal)
        if (errorCode !== 0)
          cb(new Error(meta.error_message || `${meta.method_name} 错误(${errorCode})`))
        else
          cb(null, Buffer.from(msg.body), meta)
      }
    }
  }

  private handleNotify(msg: any) {
    if (!msg.body || msg.body.length === 0)
      return
    const event = this.protoTypes.EventMessage.decode(msg.body)

    const type = event.message_type || ''
    const eventBody = event.body
    const t = this.protoTypes

    if (type.includes('Kickout')) {
      try {
        const notify: any = t.KickoutNotify.decode(eventBody)
        const reason = notify.reason_message || '未知'
        this.emit('kickout', { type, reason })
      } catch {
        this.emit('kickout', { type, reason: '未知' })
      }
      return
    }

    if (type.includes('ItemNotify')) {
      try {
        const notify: any = t.ItemNotify.decode(eventBody)
        const items = notify.items || []
        for (const itemChg of items) {
          const item = itemChg.item
          if (!item)
            continue
          const id = toNum(item.id)
          const count = toNum(item.count)
          const delta = toNum(itemChg.delta)

          if (id === 1101) {
            if (count > 0)
              this.userState.exp = count
            else if (delta !== 0)
              this.userState.exp = Math.max(0, (this.userState.exp || 0) + delta)
          } else if (id === 1 || id === 1001) {
            if (count > 0)
              this.userState.gold = count
            else if (delta !== 0)
              this.userState.gold = Math.max(0, (this.userState.gold || 0) + delta)
          } else if (id === 1002) {
            if (count > 0)
              this.userState.coupon = count
            else if (delta !== 0)
              this.userState.coupon = Math.max(0, (this.userState.coupon || 0) + delta)
          }
        }
        this.emit('stateChanged', { ...this.userState })
      } catch {}
    }

    if (type.includes('BasicNotify')) {
      try {
        const notify: any = t.BasicNotify.decode(eventBody)
        if (notify.basic) {
          if (Object.hasOwn(notify.basic, 'level')) {
            const next = toNum(notify.basic.level)
            if (Number.isFinite(next) && next > 0)
              this.userState.level = next
          }
          if (Object.hasOwn(notify.basic, 'gold')) {
            const next = toNum(notify.basic.gold)
            if (Number.isFinite(next) && next >= 0)
              this.userState.gold = next
          }
          if (Object.hasOwn(notify.basic, 'exp')) {
            const exp = toNum(notify.basic.exp)
            if (Number.isFinite(exp) && exp >= 0)
              this.userState.exp = exp
          }
          this.emit('stateChanged', { ...this.userState })
        }
      } catch {}
    }

    // Forward all other notifications as raw data to the core process
    this.emit('notify', { type, body: Buffer.from(eventBody).toString('base64') })
  }

  private sendLogin(): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = this.protoTypes
      const body = Buffer.from(t.LoginRequest.encode(t.LoginRequest.create({
        sharer_id: toLong(0),
        sharer_open_id: '',
        device_info: {
          client_version: this.cfg.clientVersion,
          sys_software: this.cfg.deviceInfo.sysSoftware,
          network: this.cfg.deviceInfo.network,
          memory: this.cfg.deviceInfo.memory,
          device_id: this.cfg.deviceInfo.deviceId
        },
        share_cfg_id: toLong(0),
        scene_id: '1256',
        report_data: {
          callback: '',
          cd_extend_info: '',
          click_id: '',
          clue_token: '',
          minigame_channel: 'other',
          minigame_platid: 2,
          req_id: '',
          trackid: ''
        }
      })).finish())

      this.sendMsg('gamepb.userpb.UserService', 'Login', body, (err, bodyBytes) => {
        if (err) {
          if (err.message.includes('code=')) {
            this._loginFailed = true
            this.emit('loginFailed', err)
          }
          reject(err)
          return
        }
        let reply: any
        try {
          reply = t.LoginReply.decode(bodyBytes!)
        } catch (e: any) {
          this._loginFailed = true
          reject(new Error(`登录解码失败: ${e?.message}`))
          return
        }
        if (reply.basic) {
          this.userState.gid = toNum(reply.basic.gid)
          this.userState.name = reply.basic.name || '未知'
          this.userState.level = toNum(reply.basic.level)
          this.userState.gold = toNum(reply.basic.gold)
          this.userState.exp = toNum(reply.basic.exp)
          this.userState.avatarUrl = reply.basic.avatar_url || ''
          this.userState.openId = reply.basic.open_id || ''
          if (reply.time_now_millis)
            syncServerTime(toNum(reply.time_now_millis))
          this._connected = true

          this._reconnectAttempts = 0
          this._loginFailed = false
          this.startHeartbeat()
          this.emit('login', this.userState)
          resolve()
        } else {
          reject(new Error('登录响应无 basic 字段'))
        }
      }).then((sent) => {
        if (!sent)
          reject(new Error('登录发送失败'))
      }).catch(reject)
    })
  }

  /**
   * 发送 BatchClientReportFlow（活跃信号）。
   * 真实客户端在业务操作后 3-10s 触发，连续操作去抖，空闲时 40-120s 兜底。
   */
  private sendBcrf() {
    const t = this.protoTypes
    if (!t.BatchClientReportFlowRequest || !this._connected)
      return
    const bcrfBody = Buffer.from(
      t.BatchClientReportFlowRequest.encode(
        t.BatchClientReportFlowRequest.create({})
      ).finish()
    )
    this.sendMsg('gamepb.userpb.UserService', 'BatchClientReportFlow', bcrfBody)
    this.lastBcrfTime = Date.now()
  }

  /**
   * 在业务操作后延迟发送 BCRF（去抖：连续操作只触发一次）。
   * 模拟真实客户端在 UI 交互后 3-10s 上报行为流。
   */
  private scheduleBcrf() {
    const now = Date.now()
    const isNew = !this.scheduler.has('bcrf_debounce')
    if (isNew)
      this.bcrfWindowStart = now

    const elapsed = now - this.bcrfWindowStart
    const maxRemaining = Math.max(0, 12000 - elapsed) // 最大等待 12s
    if (maxRemaining <= 0) {
      this.scheduler.clear('bcrf_debounce')
      this.bcrfWindowStart = 0
      this.sendBcrf()
      return
    }

    const randomDelay = 3000 + Math.floor(Math.random() * 7000) // 3-10s 随机延迟
    const delay = Math.min(randomDelay, maxRemaining)

    this.scheduler.clear('bcrf_debounce')
    this.scheduler.setTimeoutTask('bcrf_debounce', delay, () => {
      this.bcrfWindowStart = 0
      this.sendBcrf()
    })
  }

  private startHeartbeat() {
    this.scheduler.clear('heartbeat_interval')
    this.lastHeartbeatResponse = Date.now()
    this.heartbeatMissCount = 0
    this.lastBcrfTime = Date.now()
    const t = this.protoTypes

    // 登录后 3-8s 发送第一次 BCRF（模拟真实客户端 SetDisplayInfo 后立即上报）
    this.scheduler.setTimeoutTask('bcrf_first', 3000 + Math.floor(Math.random() * 5000), () => this.sendBcrf())

    this.scheduler.setIntervalTask('heartbeat_interval', HEARTBEAT_INTERVAL_MS, () => {
      if (!this.userState.gid)
        return
      const timeSince = Date.now() - this.lastHeartbeatResponse
      if (timeSince > 60000) {
        this.heartbeatMissCount++
        if (this.heartbeatMissCount >= 2) {
          this.pendingCallbacks.forEach((cb) => {
            try {
              cb(new Error('连接超时，已清理'))
            } catch {}
          })
          this.pendingCallbacks.clear()
        }
      }

      const body = Buffer.from(t.HeartbeatRequest.encode(t.HeartbeatRequest.create({
        gid: toLong(this.userState.gid),
        client_version: this.cfg.clientVersion
      })).finish())

      this.sendMsg('gamepb.userpb.UserService', 'Heartbeat', body, (err, replyBody) => {
        if (err || !replyBody)
          return
        this.lastHeartbeatResponse = Date.now()
        this.heartbeatMissCount = 0
        try {
          const reply: any = t.HeartbeatReply.decode(replyBody)
          if (reply.server_time)
            syncServerTime(toNum(reply.server_time))
        } catch {}
      })

      // 空闲兜底：如果距离上次 BCRF 超过 40-120s，在心跳中补发一次
      // 真实客户端空闲时 BCRF 间隔 40-260s，这里取保守值
      const bcrfElapsed = Date.now() - this.lastBcrfTime
      const bcrfIdleThreshold = 40000 + Math.floor(Math.random() * 80000) // 40-120s
      if (bcrfElapsed > bcrfIdleThreshold) {
        this.sendBcrf()
      }
    })
  }

  connect(code: string, platform = 'qq'): Promise<void> {
    if (this._destroyed)
      return Promise.reject(new Error('GameClient已销毁'))
    this.savedCode = code
    this.platform = platform
    this._loginFailed = false
    const url = `${this.cfg.serverUrl}?platform=${platform}&os=${this.cfg.os}&ver=${this.cfg.clientVersion}&code=${code}&openID=`

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13)',
          'Origin': 'https://gate-obt.nqf.qq.com'
        }
      })
      this.ws.binaryType = 'arraybuffer'

      this.ws.on('open', () => {
        this.sendLogin().then(resolve).catch(reject)
      })

      this.ws.on('message', (data: any) => {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
        this.handleMessage(buf)
      })

      this.ws.on('close', (closeCode: number) => {
        this._connected = false
        this.cleanup()
        reject(new Error(`连接关闭 code=${closeCode}`))

        const shouldReconnect = !this._destroyed
          && this.savedCode
          && !this._loginFailed
          && this._reconnectAttempts < GameClient.MAX_RECONNECT_ATTEMPTS

        if (shouldReconnect) {
          this._reconnectAttempts++
          this.emit('reconnecting', {
            attempt: this._reconnectAttempts,
            maxAttempts: GameClient.MAX_RECONNECT_ATTEMPTS
          })
          this.scheduler.setTimeoutTask('auto_reconnect', 5000, () => {
            this.reconnect().catch(() => {})
          })
        } else {
          this._loginFailed = false
          this.emit('close', closeCode)
        }
      })

      this.ws.on('error', (err: any) => {
        const message = err?.message || ''
        const match = message.match(RE_UNEXPECTED_RESPONSE)
        if (match) {
          const errCode = Number.parseInt(match[1], 10) || 0
          if (errCode)
            this.emit('ws_error', { code: errCode, message })
        }
      })
    })
  }

  private cleanup() {
    this.scheduler.clearAll()
    this.pendingCallbacks.clear()
  }

  async reconnect(newCode?: string): Promise<void> {
    this.cleanup()
    if (this.ws) {
      this.ws.removeAllListeners()
      this.ws.close()
      this.ws = null
    }
    this.userState.gid = 0
    this._connected = false
    this.clientSeq = 1
    this.serverSeq = 0
    await this.connect(newCode || this.savedCode!, this.platform)
  }

  isConnected(): boolean {
    return this._connected && !!this.ws && this.ws.readyState === 1
  }

  destroy() {
    this._destroyed = true
    this._connected = false
    this.cleanup()
    if (this.ws) {
      this.ws.removeAllListeners()
      this.ws.on('error', () => {}) // 防止关闭时触发未处理错误
      try {
        this.ws.close()
      } catch {}
      this.ws = null
    }
    this.removeAllListeners()
  }
}
