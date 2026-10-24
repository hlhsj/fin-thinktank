import type { StockValuationCycle, StockValuationDebubble, StockValuationRow } from '../lib/types'

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
  /** 仅 `debubble=1` 时返回：去泡沫二次估值结果 */
  debubble_result?: StockValuationDebubble | null
  /** 仅 `cycle=1` 时返回：周期重算结果（正常化 EPS + 去泡沫通道） */
  cycle_result?: StockValuationCycle | null
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
    // AbortController.abort() 抛 AbortError；AbortSignal.timeout() 抛 TimeoutError，两种都要认
    if (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
      throw new Error('计算超时（超过 2 分钟），请稍后重试')
    }
    // fetch 网络层失败（服务未起 / 502 / 沙箱冷启动中）抛 TypeError，
    // 原始文案是「Failed to fetch」，直接抛给用户看不懂
    if (e instanceof TypeError) {
      throw new Error('计算服务无响应（可能正在冷启动或重启），请稍后点「重试」')
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

/**
 * 按需的「去泡沫」二次估值。
 *
 * 为什么不在主请求里一起算：
 *   ① 每只股票都多算一遍会拖慢首屏——列表算 10 只就是 10 次额外估值；
 *   ② 历史通道估值本身有局限（只换分位，不解决 g 与画像脱节、不看单季拐点），
 *      只适合作为对照，不该跟主口径并列出现在结果里。
 * 所以由用户点按钮触发；后端命中缓存时复用已取好的数据重算，不重复取数。
 */
export async function valuateDebubble(code: string): Promise<StockValuationDebubble | null> {
  const data = await getJson<{ row: LiveValuation & { debubble_result?: StockValuationDebubble | null } }>(
    `/api/valuate?code=${encodeURIComponent(code)}&debubble=1`,
  )
  return data.row.debubble_result ?? null
}

/**
 * 按需的「周期重算」。
 *
 * 与去泡沫的区别：去泡沫只换历史通道，计价单位仍是 EPS(TTM)；
 * 周期重算同时把计价单位换成**跨周期正常化 EPS**（ROE 中位 × BPS），
 * 解决「周期顶部 TTM 利润 × 历史倍数」把公平价放大一个数量级的问题。
 * 同样由按钮触发、命中缓存时复用已取数据重算，不进主响应。
 */
export async function valuateCycle(code: string): Promise<StockValuationCycle | null> {
  const data = await getJson<{ row: LiveValuation & { cycle_result?: StockValuationCycle | null } }>(
    `/api/valuate?code=${encodeURIComponent(code)}&cycle=1`,
  )
  return data.row.cycle_result ?? null
}

/**
 * API 是否可用（页面据此决定是否提示「计算服务不可用」）。
 *
 * 为什么是「重试 + 12 秒」而不是「一次 4 秒」：
 * 线上是单端口 Python 服务跑在云沙箱里，**冷启动实测约 3.3 秒**（首次访问要拉起容器
 * + 导入估值包），而 4 秒超时只留 0.7 秒余量——发布后首次打开就会偶发误报「服务未启动」。
 * 单次探测失败还不能代表服务挂了：沙箱重启、网络抖动都可能让一次请求超时。
 * 故失败后隔 800ms 再试，最多 3 次（总计约 36 秒上限）；仍失败才认定不可用。
 */
export async function checkApi(retries = 2): Promise<boolean> {
  for (let i = 0; i <= retries; i += 1) {
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(12000) })
      if (res.ok) {
        const d = (await res.json()) as { ok?: boolean }
        if (d.ok) return true
      }
    } catch {
      // 超时 / 连接被拒 / 沙箱冷启动：留给下一轮重试，不在这里下结论
    }
    if (i < retries) await new Promise((r) => setTimeout(r, 800))
  }
  return false
}
