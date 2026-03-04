import path from 'node:path'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as protobuf from 'protobufjs'

@Injectable()
export class ProtoLoaderService implements OnModuleInit {
  private readonly logger = new Logger(ProtoLoaderService.name)
  private types: Record<string, protobuf.Type> = {}

  async onModuleInit() {
    const assetsDir = path.join(__dirname, '..', 'assets')
    this.logger.log(`加载 proto 定义, assetsDir=${assetsDir}`)
    this.types = await this.loadProtoTypes(assetsDir)
    this.logger.log('proto 定义加载完成')
  }

  getProtoTypes(): Record<string, protobuf.Type> {
    return this.types
  }

  private async loadProtoTypes(assetsDir: string): Promise<Record<string, protobuf.Type>> {
    const protoDir = path.join(assetsDir, 'proto')
    const root = new protobuf.Root()

    const protoFiles = ['game.proto', 'userpb.proto'].map(f => path.join(protoDir, f))
    await root.load(protoFiles, { keepCase: true })

    const lookup = (name: string) => root.lookupType(name)
    const types: Record<string, protobuf.Type> = {}

    // Gate envelope
    types.GateMessage = lookup('gatepb.Message')
    types.GateMeta = lookup('gatepb.Meta')
    types.EventMessage = lookup('gatepb.EventMessage')
    types.KickoutNotify = lookup('gatepb.KickoutNotify')

    // Login / Heartbeat
    types.LoginRequest = lookup('gamepb.userpb.LoginRequest')
    types.LoginReply = lookup('gamepb.userpb.LoginReply')
    types.HeartbeatRequest = lookup('gamepb.userpb.HeartbeatRequest')
    types.HeartbeatReply = lookup('gamepb.userpb.HeartbeatReply')

    return types
  }
}
