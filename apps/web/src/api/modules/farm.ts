import { ws } from '../services/ws'

export function operate(opType: string): Promise<any> {
  return ws.post('/farm/operate', { opType })
}

export function onLandsUpdate(handler: (data: any) => void): void {
  ws.on('lands:update', handler)
}

export function onSeedsUpdate(handler: (data: any) => void): void {
  ws.on('seeds:update', handler)
}
