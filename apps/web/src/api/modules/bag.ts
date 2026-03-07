import { ws } from '../services/ws'

export function onBagUpdate(handler: (data: any) => void): void {
  ws.on('bag:update', handler)
}

export function offBagUpdate(handler: (data: any) => void): void {
  ws.off('bag:update', handler)
}
