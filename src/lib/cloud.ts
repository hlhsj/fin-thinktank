import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'
import { cloudConfig, isCloudConfigured } from './config'
import type { Database } from './database.types'

/**
 * 全局唯一的云服务客户端，Auth / Database / Storage / LLM 四个模块共用。
 * endpoint 与 publishableKey 必须显式传入，不可依赖同源推断或硬编码猜测。
 * 传入 Database schema 类型后，数据表查询具备完整的行列类型。
 *
 * 未配置 `.env.local` 时用一组不可达的占位参数初始化：SDK 在构造阶段就会校验
 * key 格式，直接传空值会导致整个应用白屏；这里退化为「能启动、数据请求失败」，
 * 方便只跑前端骨架的人看到界面。
 */
const PLACEHOLDER_ENDPOINT = 'http://127.0.0.1:1'
const PLACEHOLDER_KEY = 'wbpk_unconfigured'

if (!isCloudConfigured) {
  console.warn(
    '[cloud] 未检测到云服务配置，数据读写将全部失败。\n' +
      '        请复制 .env.example 为 .env.local 并填写 VITE_CLOUD_ENDPOINT / VITE_CLOUD_PUBLISHABLE_KEY。',
  )
}

export const cloud = createWorkBuddyCloud<Database>({
  endpoint: cloudConfig.endpoint || PLACEHOLDER_ENDPOINT,
  oauthRelayBaseUrl: cloudConfig.oauthRelayBaseUrl,
  publishableKey: cloudConfig.publishableKey || PLACEHOLDER_KEY,
})

export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error
  return result.data
}
