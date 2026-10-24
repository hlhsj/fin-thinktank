/**
 * 统一 API 客户端（v2 重构核心）。
 *
 * 变化：浏览器不再持有云数据库凭据、也不再直连 PostgREST —— 所有数据访问都走
 * 同源 `/api/rpc/{method}`，由 Python 后端鉴权、缓存与聚合。
 *
 * 约定：
 *  - 会话令牌存在 localStorage（`thinktank.session`），由 auth.ts 维护；
 *  - 每次调用自动附带 `__auth`，因此像「保存词条」这类没有显式 auth 参数的
 *    旧函数无需改签名也能通过后端鉴权；
 *  - 后端错误统一为 `{ok:false,error}`，这里抛出 Error(message)，页面上的
 *    readableError() 可直接展示。
 */

export interface SessionAuth {
  uid: string
  token: string | null
}

const STORAGE_KEY = 'thinktank.session'

export function readSession(): SessionAuth | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<SessionAuth>
    if (!s?.uid) return null
    return { uid: String(s.uid), token: s.token ?? null }
  } catch {
    return null
  }
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** 方法名与后端 `app/registry.py` 注册表一一对应 */
export async function call<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const auth = readSession()
  let res: Response
  try {
    res = await fetch(`/api/rpc/${encodeURIComponent(method)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(auth ? { ...args, __auth: auth } : args),
    })
  } catch {
    throw new ApiError('服务无响应（可能正在冷启动），请稍后重试', 0)
  }

  const text = await res.text()
  let data: { ok?: boolean; data?: unknown; error?: string } | null = null
  try {
    data = text ? (JSON.parse(text) as { ok?: boolean; data?: unknown; error?: string }) : null
  } catch {
    throw new ApiError(`服务返回异常（HTTP ${res.status}）`, res.status)
  }

  if (!res.ok || !data || data.ok === false) {
    throw new ApiError(data?.error || `请求失败（HTTP ${res.status}）`, res.status)
  }
  return (data.data ?? null) as T
}
