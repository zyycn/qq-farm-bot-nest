import type { AccountMutationPayload, QrCheckResponse, QrCreateResponse } from '../types'
import api from '../services/request'
import { socket } from '../services/socket'

export function createQR(): Promise<QrCreateResponse> {
  return api.post('/api/qr/create')
}

export function checkQR(code: string): Promise<QrCheckResponse> {
  return api.post('/api/qr/check', { code })
}

export function start(id: string): Promise<null> {
  return socket.request('accounts.start', { id })
}

export function stop(id: string): Promise<null> {
  return socket.request('accounts.stop', { id })
}

export function create(data: AccountMutationPayload): Promise<unknown> {
  return socket.request('accounts.upsert', data)
}

export function remove(id: string): Promise<unknown> {
  return socket.request('accounts.delete', { id })
}

export function remark(uin: string | number, name: string): Promise<unknown> {
  return socket.request('accounts.remark', { uin, name })
}
