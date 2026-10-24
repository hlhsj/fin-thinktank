import { call } from './api'
import { normalizePhone } from '../lib/utils'

/**
 * 自建账号体系（v2：经 BFF 转发）。
 *
 * 与 v1 的区别：浏览器不再直连云库 RPC，改为 POST `/api/rpc/{method}`，
 * 由 Python 后端转发数据库 SECURITY DEFINER 函数。
 * 安全属性不变：密码用 bcrypt 在**服务端**比对、哈希不出库、令牌由数据库签发。
 */
export interface AccountSession {
  uid: string
  phone: string
  nickname: string
  memberExpireAt: string | null
  masterExpireAt: string | null
  masterPeriod: string | null
  isAdmin: boolean
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

async function callAuth(method: string, args: Record<string, unknown>): Promise<AccountSession> {
  const row = await call<AuthRpcRow | null>(method, args)
  if (!row) throw new Error('服务未返回结果，请稍后重试')
  if (!row.ok || !row.uid) {
    throw new Error(AUTH_REASON_TEXT[row.reason ?? ''] ?? '操作失败，请稍后重试')
  }
  return toSession(row)
}

export function registerAccount(phone: string, password: string, nickname?: string) {
  return callAuth('registerAccount', {
    phone: normalizePhone(phone),
    password,
    nickname: nickname?.trim() ?? '',
  })
}

export function loginAccount(phone: string, password: string) {
  return callAuth('loginAccount', { phone: normalizePhone(phone), password })
}

/**
 * 顶部导航「刷新状态」：不需要密码，仅凭 uid 重读一次权益。
 * 该 RPC 不签发新 token，因此沿用调用方原有 token（否则刷新后受保护数据会读不到）。
 */
export async function refreshAccount(uid: string, prevToken?: string | null): Promise<AccountSession> {
  const s = await callAuth('refreshAccount', { uid })
  return { ...s, token: prevToken ?? s.token }
}

export interface AdminUserRow extends AccountSession {
  createdAt: string | null
  lastLoginAt: string | null
}

export async function adminListUsers(adminUid: string, token: string | null): Promise<AdminUserRow[]> {
  const rows = await call<Array<AuthRpcRow & { created_at: string | null; last_login_at: string | null }>>(
    'adminListUsers',
    { adminUid, token },
  )
  const list = (rows ?? []).filter((r) => r.ok)
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
  masterPeriod?: string | null,
) {
  return callAuth('adminGrant', {
    adminUid,
    token,
    phone: normalizePhone(phone),
    memberExpire,
    masterExpire,
    masterPeriod: masterPeriod ?? null,
  })
}

export async function adminRevoke(
  adminUid: string,
  token: string | null,
  targetUid: string,
  kind: 'member' | 'master' | 'all',
): Promise<AccountSession> {
  return callAuth('adminRevoke', { adminUid, token, targetUid, kind })
}

export async function adminSetAdmin(
  adminUid: string,
  token: string | null,
  targetUid: string,
  isAdmin: boolean,
) {
  const ok = await call<boolean>('adminSetAdmin', { adminUid, token, targetUid, isAdmin })
  if (ok !== true) throw new Error('操作未生效，请确认你有管理权限')
}

/* ---------------- 密码重置（忘记密码） ---------------- */

export async function requestPasswordReset(phone: string, newPassword: string): Promise<void> {
  const row = await call<AuthRpcRow | null>('requestPasswordReset', {
    phone: normalizePhone(phone),
    newPassword,
  })
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

export async function adminListPasswordResets(
  uid: string,
  token: string | null,
): Promise<PasswordResetRow[]> {
  const rows = await call<Array<Record<string, unknown>>>('adminListPasswordResets', { uid, token })
  return (rows ?? []).map((r) => ({
    id: Number(r.id),
    phone: String(r.phone ?? ''),
    nickname: String(r.nickname ?? ''),
    status: String(r.status ?? ''),
    requestedAt: (r.requested_at as string) ?? null,
    handledAt: (r.handled_at as string) ?? null,
  }))
}

export async function adminResolvePasswordReset(
  uid: string,
  token: string | null,
  resetId: number,
  approve: boolean,
): Promise<void> {
  await call('adminResolvePasswordReset', { uid, token, resetId, approve })
}
