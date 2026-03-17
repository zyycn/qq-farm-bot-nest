import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as protobuf from 'protobufjs'
import { buildInvokeTypePrefixMap, INVOKE_TYPE_MAP, NESTED_BYTES_FIELDS } from './proto/invoke-type-map'

type ProtoJsonRecord = Record<string, unknown>

@Injectable()
export class GameInvokeService implements OnModuleInit {
  private readonly logger = new Logger(GameInvokeService.name)
  private fullTypes: Record<string, protobuf.Type> = {}
  private nestedTypes: Record<string, protobuf.Type> = {}
  private ready = false

  async onModuleInit() {
    await this.loadFullProto()
  }

  private async loadFullProto(): Promise<void> {
    const protoDir = path.join(__dirname, '..', 'assets', 'proto')
    const root = new protobuf.Root()
    const protoFiles = fs.readdirSync(protoDir)
      .filter(name => name.endsWith('.proto'))
      .sort((a, b) => a.localeCompare(b))
      .map(name => path.join(protoDir, name))

    try {
      await root.load(protoFiles, { keepCase: true })
    } catch (e) {
      this.logger.warn(`未加载完整协议定义（请确保 apps/link/assets/proto 存在）: ${(e as Error).message}`)
      this.ready = false
      return
    }

    const prefixMap = buildInvokeTypePrefixMap()
    const types: Record<string, protobuf.Type> = {}

    for (const [name, prefix] of prefixMap) {
      try {
        types[name] = root.lookupType(`${prefix}.${name}`)
      } catch {
        this.logger.warn(`协议类型未找到: ${prefix}.${name}`)
      }
    }

    this.fullTypes = types

    const nestedTypes: Record<string, protobuf.Type> = {}
    for (const [key, { type: typeName }] of Object.entries(NESTED_BYTES_FIELDS)) {
      const service = key.split('::')[0]
      const pkg = service.substring(0, service.lastIndexOf('.'))
      try {
        nestedTypes[typeName] = root.lookupType(`${pkg}.${typeName}`)
      } catch {
        this.logger.warn(`协议嵌套类型未找到: ${pkg}.${typeName}`)
      }
    }
    this.nestedTypes = nestedTypes

    this.ready = true
    this.logger.log('完整调用协议定义加载完成')
  }

  isReady(): boolean {
    return this.ready
  }

  /** 根据 (service, method) 获取请求/响应类型 */
  getTypes(service: string, method: string): { RequestType: protobuf.Type, ReplyType: protobuf.Type } | null {
    const methods = INVOKE_TYPE_MAP[service]
    if (!methods)
      return null
    const pair = methods[method]
    if (!pair)
      return null
    const [reqName, replyName] = pair
    const RequestType = this.fullTypes[reqName]
    const ReplyType = this.fullTypes[replyName]
    if (!RequestType || !ReplyType)
      return null
    return { RequestType, ReplyType }
  }

  /** 将 JSON 参数编码为 proto 请求体；fromObject 递归处理嵌套消息与 int64 转换 */
  encodeRequest(service: string, method: string, params: Record<string, unknown>): Buffer | null {
    const types = this.getTypes(service, method)
    if (!types)
      return null
    try {
      const msg = types.RequestType.fromObject(params)
      return Buffer.from(types.RequestType.encode(msg).finish())
    } catch {
      return null
    }
  }

  /** 将响应 body 解码为普通对象 */
  decodeReply(service: string, method: string, body: Buffer): unknown {
    const types = this.getTypes(service, method)
    if (!types)
      return null
    try {
      const decoded = types.ReplyType.decode(body)
      const obj = types.ReplyType.toObject(decoded, { longs: String, enums: String }) as ProtoJsonRecord
      return this.decodeNestedBytes(service, method, obj)
    } catch {
      return null
    }
  }

  /**
   * 对含有 repeated bytes 嵌套消息的响应做二次解码。
   * 例如 GetMallListBySlotType 的 goods_list 是 repeated bytes（序列化的 MallGoods），
   * 需要逐个 decode 才能在 JSON 传输后正确读取 goods_id / is_free 等字段。
   */
  private decodeNestedBytes(service: string, method: string, obj: ProtoJsonRecord): ProtoJsonRecord {
    const spec = NESTED_BYTES_FIELDS[`${service}::${method}`]
    if (!spec)
      return obj
    const ProtoType = this.nestedTypes[spec.type]
    const fieldValue = obj[spec.field]
    if (!ProtoType || !Array.isArray(fieldValue))
      return obj
    const toObj = { longs: String, enums: String } as protobuf.IConversionOptions
    obj[spec.field] = fieldValue
      .map((raw: Uint8Array | Buffer) => {
        try {
          return ProtoType.toObject(ProtoType.decode(raw), toObj)
        } catch {
          return null
        }
      })
      .filter(Boolean)
    return obj
  }
}
