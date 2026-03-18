export interface LogQueryOptions {
  module?: string
  event?: string
  keyword?: string
  isWarn?: string
  limit?: number
}

export interface LogEntryMeta {
  event?: string
  [key: string]: unknown
}

export interface LogEntry {
  createdAt?: number
  ts?: number
  time?: string
  msg?: string
  tag?: string
  isWarn?: boolean
  meta?: LogEntryMeta
  [key: string]: unknown
}
