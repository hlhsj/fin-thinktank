/**
 * ── 文件：src/lib/config.ts ─────────────────────────────────────
 * 功能：读取 .env.local 的三个云服务参数，导出 cloudConfig 与 isCloudConfigured。
 * 改动指引：
 *   1. 新增配置项 → 这里加字段，同时更新 .env.example（Vite 只暴露 VITE_ 前缀的变量）；
 *   2. 改 host 校验逻辑 → isCloudConfigured；
 *   3. 不要把真实 endpoint / key 写回代码 —— 公开仓库只留占位。
 */

/**
 * 云服务连接配置。
 *
 * 本仓库**不包含**任何真实环境凭据。运行前请复制 `.env.example` 为 `.env.local`
 * 并填入你自己的云服务参数：
 *
 *   VITE_CLOUD_ENDPOINT         应用发布域名（承载 `/.cloud/**`）
 *   VITE_CLOUD_OAUTH_RELAY      OAuth 中继地址，由云服务控制台下发
 *   VITE_CLOUD_PUBLISHABLE_KEY  客户端可公开的 publishableKey（不含权限，服务端做 Origin 校验）
 *
 * 说明：publishableKey 设计上允许出现在前端产物中，但**具体项目的 key 不应提交进
 * 公开仓库**——它绑定了应用域名与调用额度。
 */

const env = import.meta.env

export const cloudConfig = {
  endpoint: (env.VITE_CLOUD_ENDPOINT ?? '').replace(/\/+$/, ''),
  oauthRelayBaseUrl: env.VITE_CLOUD_OAUTH_RELAY ?? '',
  publishableKey: env.VITE_CLOUD_PUBLISHABLE_KEY ?? '',
}

/** 是否已完成云服务配置：未配置时前端只渲染静态骨架，不发数据请求 */
export const isCloudConfigured = Boolean(cloudConfig.endpoint && cloudConfig.publishableKey)
