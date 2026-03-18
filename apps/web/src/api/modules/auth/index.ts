import type * as Auth from './types'
import api from '../../services/request'

export type * from './types'

export function login(password: string): Promise<Auth.LoginResponse> {
  return api.post('/api/auth/login', { password })
}

export function validate(): Promise<Auth.ValidateResponse> {
  return api.get('/api/auth/validate')
}

export function changePassword(oldPassword: string, newPassword: string): Promise<null> {
  return api.post('/api/auth/change-password', { oldPassword, newPassword })
}

export function logout(): Promise<null> {
  return api.post('/api/auth/logout')
}
