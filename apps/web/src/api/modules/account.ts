import api from '../services/request'

export function createQR() {
  return api.post('/api/qr/create')
}

export function checkQR(code: string) {
  return api.post('/api/qr/check', { code })
}
