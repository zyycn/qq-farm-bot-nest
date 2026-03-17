import api from '../services/request'

interface LoginResponse {
  token: string
}

export function login(password: string) {
  return api.post<LoginResponse>('/api/auth/login', { password })
}

export function validate() {
  return api.get('/api/auth/validate')
}

export function changePassword(oldPassword: string, newPassword: string) {
  return api.post('/api/auth/change-password', { oldPassword, newPassword })
}

export function logout() {
  return api.post('/api/auth/logout')
}
