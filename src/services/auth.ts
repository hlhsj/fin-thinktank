/**
 * ── 文件：src/services/auth.ts ──────────────────────────────────
 * 功能：自建账号体系：注册 / 登录 / 刷新 / 登出、管理员用户管理、密码重置申请与审核，
 *       全部走 SECURITY DEFINER 的 RPC（app_users 表对客户端不可见）。
 * 改动指引：
 *   1. 改密码策略 → 服务端函数（本文件只传参）；
 *   2. 加账号字段 → AuthRpcRow + toSession + AuthContext 的 AppUser；
 *   3. 改错误提示 → AUTH_REASON_TEXT（把服务端 reason 映射成中文）。
 */

import { cloud } from '../lib/cloud'
import { normalizePhone } from '../lib/utils'

/**
 * 自建账号体系。
 *
 * 为什么不用云服务自带的 Auth：注册接口强制要求短信验证码换来的 verification_token，
 * 纯「用户名 + 密码」注册会被上游 501 明确拒绝（已实测）。为了让 wizard 式的一键注册成立，
 * 账号改为本站自建，落在云数据库的 `app_users` 表。
 *
 * 安全设计：
 * - `app_users` 开启 RLS 且不建任何读策略，客户端角色拿不到任何一行，密码哈希不外泄。
 * - 注册/登录/刷新/后台都走 SECURITY DEFINER 函数，密码用 pgcrypto bcrypt 在**服务端**比对，
 *   明文密码仅存在于这一次 HTTPS 请求中；函数只回传权益字段，从不返回 password_hash。
 * - 平台历史上第一个注册的账号自动成为管理员，之后由管理员授权。
 */
export interface AccountSession {
  uid: string
  phone: string
  nickname: string
  memberExpireAt: string | null
  masterExpireAt: string | null
  masterPeriod: string | null
  isAdmin: boolean
  /**
   * 服务端签发的访问令牌（HMAC-SHA256，`uid|过期时间.签名`，有效期 7 天）。
   *
   * 用途：受保护数据（订单、章节正文、留言）不再对匿名角色开放，
   * 必须带上它调用 SECURITY DEFINER 函数，由**服务端**校验身份与权益后再返回。
   * 密钥只存在于数据库函数内，前端无法伪造。
   */
  token: string | null
}

interface AuthRpcRow {
  ok: boolean | null
  reason: string | null
  uid: string | null
  phone: string | null
  nickname: string | null
  member_expire_at: string | null
  master_expire_at: string | null
  master_period: string | null
  is_admin: boolean | null
  token: string | null
}

/** SDK 的 rpc 泛型依赖 schema 的 Functions 类型，这里按实际返回形态单独断言一次即可 */
const rpc = cloud.database.rpc as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: AuthRpcRow[] | null; error: unknown }>

export const AUTH_REASON_TEXT: Record<string, string> = {
  PHONE_INVALID: '请输入正确的 11 位手机号',
  PASSWORD_INVALID: '密码必须是 6 位数字',
  PHONE_TAKEN: '该手机号已注册，请直接登录',
  BAD_CREDENTIALS: '账号或密码不正确，请检查后重试',
  NOT_FOUND: '账号不存在，请重新注册',
  NOT_ADMIN: '没有后台管理权限',
  PHONE_NOT_FOUND: '该手机号还没有注册账号',
  TOO_MANY_REQUESTS: '提交过于频繁，请 24 小时后再试',
}

function toSession(row: AuthRpcRow): AccountSession {
  return {
    uid: row.uid ?? '',
    phone: row.phone ?? '',
    nickname: row.nickname ?? '',
    memberExpireAt: row.member_expire_at ?? null,
    masterExpireAt: row.master_expire_at ?? null,
    masterPeriod: row.master_period ?? null,
    isAdmin: Boolean(row.is_admin),
    token: row.token ?? null,
  }
}

async function callAuth(fn: string, args: Record<string, unknown>): Promise<AccountSession> {
  const { data, error } = await rpc(fn, args)
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : null
  if (!row) throw new Error('服务未返回结果，请稍后重试')
  if (!row.ok || !row.uid) {
    throw new Error(AUTH_REASON_TEXT[row.reason ?? ''] ?? '操作失败，请稍后重试')
  }
  return toSession(row)
}

export function registerAccount(phone: string, password: string, nickname?: string) {
  return callAuth('app_register', {
    p_phone: normalizePhone(phone),
    p_password: password,
    p_nickname: nickname?.trim() ?? '',
  })
}

export function loginAccount(phone: string, password: string) {
  return callAuth('app_login', {
    p_phone: normalizePhone(phone),
    p_password: password,
  })
}

/**
 * 顶部导航「刷新状态」：不需要密码，仅凭 uid 重读一次权益。
 * 注意：该 RPC 不签发新 token，因此沿用调用方原有的 token（否则刷新后受保护数据会读不到）。
 */
export async function refreshAccount(uid: string, prevToken?: string | null): Promise<AccountSession> {
  const s = await callAuth('app_refresh_account', { p_uid: uid })
  return { ...s, token: prevToken ?? s.token }
}

export interface AdminUserRow extends AccountSession {
  createdAt: string | null
  lastLoginAt: string | null
}

export async function adminListUsers(adminUid: string, token: string | null): Promise<AdminUserRow[]> {
  // 用户管理系列 RPC 统一改为「uid + 服务端令牌」校验：只凭 uid 调用可被冒用（uid 泄露即可提权/授权）
  const { data, error } = await rpc('app_admin_list_users', { p_uid: adminUid, p_token: token ?? '' })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : null
  if (!row) throw new Error('服务未返回结果，请稍后重试')
  if (!row.ok) throw new Error(AUTH_REASON_TEXT[row.reason ?? ''] ?? '查询失败')
  const list = (data ?? []).filter((r) => r.ok) as Array<
    AuthRpcRow & { created_at: string | null; last_login_at: string | null }
  >
  return list.map((r) => ({
    ...toSession(r),
    createdAt: r.created_at ?? null,
    lastLoginAt: r.last_login_at ?? null,
  }))
}

export function adminGrant(
  adminUid: string,
  token: string | null,
  phone: string,
  memberExpire: string | null,
  masterExpire: string | null,
) {
  return callAuth('app_admin_grant', {
    p_uid: adminUid,
    p_token: token ?? '',
    p_phone: normalizePhone(phone),
    p_member_expire: memberExpire,
    p_master_expire: masterExpire,
  })
}

/**
 * 取消用户权益。
 *
 * 为什么需要独立 RPC：`app_admin_grant` 里学员到期日是 `COALESCE(新值, 旧值)`，
 * 传 null 表示「不改动」——所以无法用它取消学员权益；本函数按 kind 显式置空：
 * `member`（仅学员）/ `master`（仅高级学员）/ `all`（两者都取消）。
 */
export async function adminRevoke(
  adminUid: string,
  token: string | null,
  targetUid: string,
  kind: 'member' | 'master' | 'all',
): Promise<AccountSession> {
  return callAuth('app_admin_revoke', {
    p_uid: adminUid,
    p_token: token ?? '',
    p_target_uid: targetUid,
    p_kind: kind,
  })
}

export async function adminSetAdmin(
  adminUid: string,
  token: string | null,
  targetUid: string,
  isAdmin: boolean,
) {
  const { data, error } = (await rpc('app_admin_set_admin', {
    p_uid: adminUid,
    p_token: token ?? '',
    p_target_uid: targetUid,
    p_is_admin: isAdmin,
  })) as unknown as { data: boolean | null; error: unknown }
  if (error) throw error
  if (data !== true) throw new Error('操作未生效，请确认你有管理权限')
}

/* ---------------- 密码重置（忘记密码） ---------------- */

/**
 * 忘记密码：提交重置申请。
 *
 * 安全设计：仅凭手机号就能改密码并不安全（手机号属公开信息，等于账号可被任意夺取），
 * 因此这里只**生成待审申请**：新密码在服务端立即用 bcrypt 加密入库（明文不落库、也不再回传），
 * 由管理员在后台「用户与权益 → 密码重置」核对身份后批准，批准的那一刻才真正写入账号。
 */
export async function requestPasswordReset(phone: string, newPassword: string): Promise<void> {
  const { data, error } = await rpc('app_request_password_reset', {
    p_phone: normalizePhone(phone),
    p_new_password: newPassword,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : null
  if (!row?.ok) throw new Error(AUTH_REASON_TEXT[row?.reason ?? ''] ?? '提交失败，请稍后重试')
}

export interface PasswordResetRow {
  id: number
  phone: string
  nickname: string
  status: string
  requestedAt: string | null
  handledAt: string | null
}

/** 管理员：密码重置申请列表（待审的排最前） */
export async function adminListPasswordResets(
  uid: string,
  token: string | null,
): Promise<PasswordResetRow[]> {
  const { data, error } = (await rpc('app_admin_list_password_resets', {
    p_uid: uid,
    p_token: token ?? '',
  })) as unknown as { data: Array<Record<string, unknown>> | null; error: unknown }
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: Number(r.id),
    phone: String(r.phone ?? ''),
    nickname: String(r.nickname ?? ''),
    status: String(r.status ?? ''),
    requestedAt: (r.requested_at as string) ?? null,
    handledAt: (r.handled_at as string) ?? null,
  }))
}

/** 管理员：批准（true）或拒绝（false）重置申请；批准后新密码对该账号立即生效 */
export async function adminResolvePasswordReset(
  uid: string,
  token: string | null,
  resetId: number,
  approve: boolean,
): Promise<void> {
  const { error } = await rpc('app_admin_resolve_password_reset', {
    p_uid: uid,
    p_token: token ?? '',
    p_reset_id: resetId,
    p_approve: approve,
  })
  if (error) throw error
}
