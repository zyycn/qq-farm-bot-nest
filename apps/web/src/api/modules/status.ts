import { ws } from '../services/ws'

export function onStatusUpdate(handler: (data: any) => void): void {
  ws.on('status:update', handler)
}

export function onStatusConnection(handler: (data: any) => void): void {
  ws.on('status:connection', handler)
}

export function onStatusProfile(handler: (data: any) => void): void {
  ws.on('status:profile', handler)
}

export function onStatusSession(handler: (data: any) => void): void {
  ws.on('status:session', handler)
}

export function onStatusOperations(handler: (data: any) => void): void {
  ws.on('status:operations', handler)
}

export function onStatusSchedule(handler: (data: any) => void): void {
  ws.on('status:schedule', handler)
}

export function onDailyGiftsUpdate(handler: (data: any) => void): void {
  ws.on('daily-gifts:update', handler)
}
