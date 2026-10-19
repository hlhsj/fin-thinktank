/**
 * ── 文件：src/services/cache.ts ─────────────────────────────────
 * 功能：localStorage 缓存封装：命名空间 + 版本号 + TTL + 体积上限，版本升级自动失效旧缓存。
 * 改动指引：
 *   1. 数据结构变更 → 提升 VERSION，让旧缓存自动失效；
 *   2. 改默认时长 → DEFAULT_TTL；
 *   3. 手动清理 → clearCache(prefix)。
 */

/**
 * 会话级数据缓存（sessionStorage + TTL）。
 *
 * 背景：云库数据的更新频率是「每交易日一次」（收盘后定时任务写入），而用户会在
 * 一次浏览中反复进入同一页面。加一层短期缓存可以避免重复的分页拉取
 * （例如 pe_index 首屏本来要翻 2 次页、全量要翻 11 次）。
 *
 * 约定：
 *  - key 统一带命名空间与版本号（ttc:v1:...）：数据口径变更时改版本号即可整体作废；
 *  - 所有读写都容错：隐私模式、配额超限、脏数据一律静默降级为「无缓存」；
 *  - maxBytes 守门：超大响应（如全量 10084 行 ≈ 1MB+）不落缓存，避免撑爆 sessionStorage。
 */

const NS = 'ttc'
const VERSION = 'v1'

/** 默认 TTL：10 分钟 —— 数据每交易日只更新一次，够用且不至于明显陈旧 */
export const DEFAULT_TTL = 10 * 60 * 1000

/** 组装缓存 key：空值部分自动略去 */
export function cacheKey(name: string, ...parts: Array<string | number | null | undefined>): string {
  const tail = parts.filter((p) => p !== null && p !== undefined && p !== '').map((p) => String(p))
  return [NS, VERSION, name, ...tail].join(':')
}

interface CacheEntry<T> {
  ts: number
  data: T
}

/** 读缓存：命中返回数据与年龄（毫秒）；未命中/异常返回 null */
export function readCache<T>(key: string): { data: T; ageMs: number } | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry<T>
    if (!parsed || typeof parsed.ts !== 'number') return null
    return { data: parsed.data, ageMs: Date.now() - parsed.ts }
  } catch {
    return null
  }
}

/** 写缓存：超出 maxBytes 或任何异常都静默跳过，返回是否写入成功 */
export function writeCache<T>(key: string, data: T, maxBytes = 512 * 1024): boolean {
  try {
    const payload = JSON.stringify({ ts: Date.now(), data } as CacheEntry<T>)
    if (payload.length > maxBytes) return false
    sessionStorage.setItem(key, payload)
    return true
  } catch {
    return false
  }
}

/** 清空指定前缀下的缓存（如数据口径变更后需要整体作废时调用） */
export function clearCache(prefix = `${NS}:${VERSION}`): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(prefix)) keys.push(k)
    }
    keys.forEach((k) => sessionStorage.removeItem(k))
  } catch {
    /* 忽略 */
  }
}
