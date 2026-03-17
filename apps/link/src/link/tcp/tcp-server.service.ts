import type { TcpRequest, TcpResponse } from '@qq-farm/shared/node'
import type { LinkTcpEventMessage } from '../connection/game-client-events'
import { Buffer } from 'node:buffer'
import net from 'node:net'
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { encodeFrame, FrameDecoder, TCP_HOST, TCP_PORT } from '@qq-farm/shared/node'
import { ConnectionManagerService } from '../connection/connection-manager.service'

interface UnknownTcpRequest {
  type?: string
  rid?: string
}

function getUnknownRequestRid(req: TcpRequest): string {
  return (req as UnknownTcpRequest).rid || ''
}

function getUnknownRequestType(req: TcpRequest): string {
  return (req as UnknownTcpRequest).type || ''
}

@Injectable()
export class TcpServerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TcpServerService.name)
  private server: net.Server
  private clients = new Set<net.Socket>()

  constructor(
    private readonly connMgr: ConnectionManagerService
  ) {
    this.server = net.createServer(socket => this.handleConnection(socket))

    this.connMgr.onEvent((accountId, event, data) => {
      this.broadcast({ type: 'event', accountId, event, data })
    })
  }

  async onModuleInit() {
    await this.start()
  }

  async onModuleDestroy() {
    await this.stop()
  }

  private handleConnection(socket: net.Socket) {
    this.clients.add(socket)
    const decoder = new FrameDecoder<TcpRequest>()
    const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`
    this.logger.log(`客户端连接: ${remoteAddr}`)

    socket.on('data', (chunk: Buffer) => {
      const messages = decoder.feed(chunk)
      for (const msg of messages) {
        this.handleRequest(socket, msg)
      }
    })

    socket.on('close', () => {
      this.clients.delete(socket)
      decoder.reset()
      this.logger.log(`客户端断开: ${remoteAddr}`)
    })

    socket.on('error', (err) => {
      this.logger.warn(`套接字异常: ${remoteAddr} - ${err.message}`)
      this.clients.delete(socket)
    })
  }

  private async handleRequest(socket: net.Socket, req: TcpRequest) {
    const respond = (res: Omit<TcpResponse, 'type'>) => {
      const frame = encodeFrame({ type: 'response', ...res } as TcpResponse)
      if (!socket.destroyed)
        socket.write(frame)
    }

    try {
      switch (req.type) {
        case 'connect': {
          const userState = await this.connMgr.connect(req.accountId, req.code, req.platform, req.clientConfig)
          respond({ rid: req.rid, ok: true, userState })
          break
        }

        case 'rebind': {
          await this.connMgr.rebind(req.fromAccountId, req.toAccountId)
          respond({ rid: req.rid, ok: true })
          break
        }

        case 'disconnect': {
          await this.connMgr.disconnect(req.accountId)
          respond({ rid: req.rid, ok: true })
          break
        }

        case 'invoke': {
          const { accountId, service, method, params } = req
          const result = await this.connMgr.invoke(accountId, service, method, params ?? {})
          respond({ rid: req.rid, ok: true, data: result.data, meta: result.meta })
          break
        }

        case 'status': {
          const status = this.connMgr.getStatus(req.accountId)
          respond({ rid: req.rid, ok: !!status, meta: status })
          break
        }

        case 'list': {
          const list = this.connMgr.listConnections()
          respond({ rid: req.rid, ok: true, meta: list })
          break
        }

        default:
          respond({
            rid: getUnknownRequestRid(req),
            ok: false,
            error: `未知请求类型: ${getUnknownRequestType(req)}`
          })
      }
    } catch (err: unknown) {
      const error = err as { message?: string }
      respond({
        rid: getUnknownRequestRid(req),
        ok: false,
        error: error?.message || '未知错误'
      })
    }
  }

  private broadcast(msg: LinkTcpEventMessage) {
    const frame = encodeFrame(msg)
    for (const socket of this.clients) {
      if (!socket.destroyed) {
        try {
          socket.write(frame)
        } catch {}
      }
    }
  }

  start(port = TCP_PORT, host = TCP_HOST): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(port, host, () => {
        this.logger.log(`传输服务监听 ${host}:${port}`)
        resolve()
      })
      this.server.on('error', reject)
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const socket of this.clients) {
        try {
          socket.destroy()
        } catch {}
      }
      this.clients.clear()
      this.server.close(() => resolve())
    })
  }
}
