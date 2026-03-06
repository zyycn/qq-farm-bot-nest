import { Module } from '@nestjs/common'
import { LinkModule } from './link/link.module'

@Module({
  imports: [LinkModule]
})
export class AppModule {}
