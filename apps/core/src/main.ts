import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { AppModule } from './app.module'
import { ApiExceptionFilter } from './common/filters/api-exception.filter'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true })
  app.useWebSocketAdapter(new IoAdapter(app))

  app.setGlobalPrefix('api')
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
  app.useGlobalInterceptors(new ResponseInterceptor())
  app.useGlobalFilters(new ApiExceptionFilter())

  const configService = app.get(ConfigService)
  const port = configService.get<number>('app.port')
  await app.listen(port, '0.0.0.0')
  console.warn(`[NestJS] 管理面板已启动: http://localhost:${port}`)
}

bootstrap()
