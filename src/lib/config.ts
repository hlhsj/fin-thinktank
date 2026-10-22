/**
 * 云服务连接配置。
 *
 * 这三个值来自 workbuddy_cloud_service 激活成功后返回的 publicConfig，
 * 是可以安全出现在前端代码中的公开配置（publishableKey 本身不携带任何权限，
 * 服务端会做精确的 Origin 校验）。底层环境凭据留在服务端，不会下发。
 */
export const cloudConfig = {
  endpoint: 'https://your-app.example.com',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_your_project_id_your_key',
}
