import { Buffer } from 'node:buffer'

export interface UserState {
  gid: number
  name: string
  level: number
  gold: number
  exp: number
  coupon: number
  avatarUrl: string
  openId: string
}

/**
 * Workers 依赖的传输层抽象接口。
 * GameClient（直连）和 ConnectorClient（TCP 代理）都实现此接口，
 * 这样 Workers 代码无需关心连接方式。
 */
export interface IGameTransport {
  /** Proto 类型定义映射，供 Workers 编解码协议使用 */
  readonly protoTypes: Record<string, any>

  /** 当前用户状态（只读引用） */
  readonly userState: UserState

  /** 发送异步协议消息，返回响应体和元数据 */
  sendMsgAsync: (
    serviceName: string,
    methodName: string,
    bodyBytes: Buffer,
    timeout?: number
  ) => Promise<{ body: Buffer, meta: any }>

  /** 当前是否已连接 */
  isConnected: () => boolean

  /** 注册事件监听 */
  on: (event: string, listener: (...args: any[]) => void) => any
  /** 移除事件监听 */
  removeListener: (event: string, listener: (...args: any[]) => void) => any
  /** 触发事件 */
  emit: (event: string, ...args: any[]) => boolean
}
