import type { ProtoTypeRegistry } from './proto-runtime'
import fs from 'node:fs'
import path from 'node:path'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as protobuf from 'protobufjs'

@Injectable()
export class ProtoLoaderService implements OnModuleInit {
  private readonly logger = new Logger(ProtoLoaderService.name)
  private types: ProtoTypeRegistry = {}

  async onModuleInit() {
    const assetsDir = path.join(__dirname, '..', '..', 'assets')
    if (!fs.existsSync(path.join(assetsDir, 'proto')))
      throw new Error(`未找到协议资源目录: ${assetsDir}`)

    this.logger.log(`加载协议定义，资源目录=${assetsDir}`)
    this.types = await this.loadProtoTypes(assetsDir)
    this.logger.log('协议定义加载完成')
  }

  getProtoTypes(): ProtoTypeRegistry {
    return this.types
  }

  private async loadProtoTypes(assetsDir: string): Promise<ProtoTypeRegistry> {
    const protoDir = path.join(assetsDir, 'proto')
    const root = new protobuf.Root()

    const protoFiles = fs.readdirSync(protoDir)
      .filter(name => name.endsWith('.proto'))
      .sort((a, b) => a.localeCompare(b))
      .map(name => path.join(protoDir, name))
    await root.load(protoFiles, { keepCase: true })

    const lookup = (name: string) => root.lookupType(name)
    const types: ProtoTypeRegistry = {}

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

    // Activity keep-alive (server treats BatchClientReportFlow as user-active signal)
    types.BatchClientReportFlowRequest = lookup('gamepb.userpb.BatchClientReportFlowRequest')

    // Notify (for session gains: gold/exp/coupon)
    types.BasicNotify = lookup('gamepb.userpb.BasicNotify')
    types.ItemNotify = lookup('gamepb.itempb.ItemNotify')
    types.TaskInfoNotify = lookup('gamepb.taskpb.TaskInfoNotify')
    types.LandsNotify = lookup('gamepb.plantpb.LandsNotify')
    types.IllustratedRewardRedDotNotifyV2 = lookup('gamepb.illustratedpb.IllustratedRewardRedDotNotifyV2')
    types.IllustratedChangeNotifyV2 = lookup('gamepb.illustratedpb.IllustratedChangeNotifyV2')

    return types
  }
}
