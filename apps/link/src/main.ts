import process from 'node:process'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import 'reflect-metadata'

async function bootstrap() {
  const logger = new Logger('Bootstrap')
  try {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger
    })
    logger.log('联机服务应用已启动')

    const shutdown = async () => {
      logger.log('正在关闭联机服务应用...')
      await app.close()
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  } catch (err) {
    logger.error(`联机服务启动失败: ${err instanceof Error ? err.message : String(err)}`, err instanceof Error ? err.stack : undefined)
    process.exit(1)
  }
}

bootstrap()
