/**
 * @qq-farm/shared — 浏览器安全的公共 API。
 *
 * Node 专属内容（TCP 协议层）从 @qq-farm/shared/node 导入。
 */

// game
export * from './game/constants'
export * from './game/user-state'

// protocol — WebSocket (browser-safe)
export * from './protocol/ws'

// utils
export * from './utils/helpers'
export * from './utils/scheduler'

// types
export * from './types/index'

// protocol — events
export * from './protocol/events'
