import process from 'node:process'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'
import { ApiExceptionFilter } from './common/filters/api-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true })

  app.setGlobalPrefix('api')
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
  app.useGlobalInterceptors(new ResponseInterceptor())
  app.useGlobalFilters(new ApiExceptionFilter())

  const port = Number(process.env.ADMIN_PORT) || 3000
  await app.listen(port, '0.0.0.0')
  console.log(`[NestJS] Admin panel started on http://localhost:${port}`)
}

bootstrap()
