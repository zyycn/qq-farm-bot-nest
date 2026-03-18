import process from 'node:process'
import { registerAs } from '@nestjs/config'

export default registerAs('app', () => ({
  port: Number(process.env.ADMIN_PORT) || 3000,
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  jwtSecret: process.env.JWT_SECRET || 'qq-farm-bot-jwt-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d'
}))
