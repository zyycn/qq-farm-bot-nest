import api from '../request'

export function login(password: string) {
  return api.post('/api/login', { password })
}

export function validate() {
  return api.get('/api/auth/validate')
}

export function changePassword(oldPassword: string, newPassword: string) {
  return api.post('/api/admin/change-password', { oldPassword, newPassword })
}

export function logout() {
  return api.post('/api/logout')
}

export function ping() {
  return api.get('/api/ping')
}
