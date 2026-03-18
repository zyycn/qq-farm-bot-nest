import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import appConfig from './app.config'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [appConfig] })]
})
export class InfrastructureConfigModule {}
