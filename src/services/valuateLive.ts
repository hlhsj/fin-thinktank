/**
 * ── 文件：src/services/valuateLive.ts ───────────────────────────
 * 功能：估值后端接口封装：股票联想、实时估值、健康检查，全部走同源 /api/*。
 * 改动指引：
 *   1. 换后端地址 / 前缀 → getJson 的 url；
 *   2. 改超时 → TIMEOUT_MS（默认 120s，估值计算本身较慢）；
 *   3. 改返回结构 → LiveValuation / SearchItem。
 * 注意：仓库不含 Python 后端实现（stock_value_estimator + api/server.py），未部署 /api 时本模块不可用，
 *       页面会提示接口异常 —— 这是预期行为，前端不内置任何估值算法。
 */

import type { StockValuationRow } from '../lib/types'

/**
 * 估值实时计算 / 股票搜索（本地 API）。
 *
 * 架构：估值逻辑是 Python（stock_value_estimator-main），浏览器跑不了；
 * 由本地服务 `api/server.py` 包一层 HTTP，实现与源程序完全一致的一份计算。
 * 前端只负责输入与渲染，**不做任何估值计算**。
 *
 * 线上部署时需要同源反向代理 /api/*（见 docs/08 接入说明 §7）。
 */

const TIMEOUT_MS = 120_000

export interface LiveValuation extends StockValuationRow {
  /** 后端计算耗时（秒），缓存命中时为原始计算耗时 */
  _elapsed?: number
  /** 是否命中 10 分钟缓存 */
  _cached?: boolean
}

export interface SearchItem {
  code: string
  name: string
  market?: string
}

async function getJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    const data = (await res.json()) as { ok: boolean; error?: string } & Record<string, unknown>
    if (!data.ok) throw new Error(data.error || `请求失败（HTTP ${res.status}）`)
    return data as T
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('计算超时（超过 2 分钟），请稍后重试')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** 代码/名称联想 */
export async function searchStocks(q: string): Promise<SearchItem[]> {
  const kw = q.trim()
  if (!kw) return []
  const data = await getJson<{ items: SearchItem[] }>(
    `/api/search?q=${encodeURIComponent(kw)}`,
  )
  return data.items ?? []
}

/** 实时计算一只股票 */
export async function valuateLive(code: string): Promise<LiveValuation> {
  const data = await getJson<{ row: LiveValuation; elapsed?: number; cached?: boolean }>(
    `/api/valuate?code=${encodeURIComponent(code)}`,
  )
  return { ...data.row, _elapsed: data.elapsed, _cached: data.cached }
}

/** API 是否可用（页面据此决定是否提示「本地计算服务未启动」） */
export async function checkApi(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(4000) })
    const d = (await res.json()) as { ok?: boolean }
    return Boolean(d.ok)
  } catch {
    return false
  }
}
