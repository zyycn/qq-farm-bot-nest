import { ws } from '../services/ws'

export function get(sortBy?: string): Promise<any[]> {
  return ws.get('/analytics', { sortBy })
}
