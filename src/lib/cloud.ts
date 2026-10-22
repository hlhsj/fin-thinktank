import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'
import { cloudConfig } from './config'
import type { Database } from './database.types'

/**
 * 全局唯一的云服务客户端，Auth / Database / Storage / LLM 四个模块共用。
 * endpoint 与 publishableKey 必须显式传入，不可依赖同源推断或硬编码猜测。
 * 传入 Database schema 类型后，数据表查询具备完整的行列类型。
 */
export const cloud = createWorkBuddyCloud<Database>({
  endpoint: cloudConfig.endpoint,
  oauthRelayBaseUrl: cloudConfig.oauthRelayBaseUrl,
  publishableKey: cloudConfig.publishableKey,
})

export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error
  return result.data
}
