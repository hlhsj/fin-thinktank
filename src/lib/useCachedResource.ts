/**
 * ── 文件：src/lib/useCachedResource.ts ──────────────────────────
 * 功能：通用数据加载 hook：内存缓存 + 可选 localStorage 持久缓存 + 并发去重 + 手动刷新。
 * 改动指引：
 *   1. 改缓存时长 → 调用处传的 ttl；
 *   2. 需要强制刷新 → 用返回的 reload()；
 *   3. 加「过期后先出旧数据再后台刷新」→ 在此 hook 内扩展，调用方不用改。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_TTL, readCache, writeCache } from '../services/cache'
import { readableError } from './utils'

export interface CachedResource<T> {
  /** 数据（可能来自缓存或网络；未就绪时为 null） */
  data: T | null
  /** 是否正在请求（命中新鲜缓存时为 false，即不阻塞渲染） */
  loading: boolean
  error: string
  /** 手动强制刷新一次 */
  revalidate: () => void
}

/**
 * 「缓存优先 + 后台刷新」的数据资源 hook（stale-while-revalidate）。
 *
 * 行为：
 *  - 命中且未过期 → 直接返回缓存，**不发网络请求**、loading=false（秒开）；
 *  - 命中但已过期 → 先渲染旧数据，同时后台静默刷新，回来后无感替换；
 *  - 未命中 → loading=true，请求完成后写入缓存。
 *
 * 两个关键防护：
 *  - `seqRef` 自增序号：key 快速切换（例如连续切板块）时，丢弃过期请求的结果，
 *    避免「标题已经是北京、曲线还是安徽」的错配；
 *  - `key === null` 表示该资源当前不需要（按需加载），此时不请求、不 loading。
 */
export function useCachedResource<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts: { ttlMs?: number } = {},
): CachedResource<T> {
  const ttl = opts.ttlMs ?? DEFAULT_TTL
  const [data, setData] = useState<T | null>(() => (key ? (readCache<T>(key)?.data ?? null) : null))
  const [loading, setLoading] = useState(() => (key ? readCache<T>(key) === null : false))
  const [error, setError] = useState('')
  /** 每次 revalidate 自增，用于强制走一次网络 */
  const [nonce, setNonce] = useState(0)
  const seqRef = useRef(0)
  /** 用 ref 持有最新的 fetcher，避免调用方每次 render 传入新函数导致 effect 空转 */
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    if (!key) {
      setLoading(false)
      return
    }
    const hit = readCache<T>(key)
    const seq = ++seqRef.current
    const fresh = !!hit && hit.ageMs < ttl
    if (hit) {
      setData(hit.data)
      setError('')
    }
    // 缓存新鲜且不是手动刷新 → 直接用缓存，不打扰网络
    if (fresh && nonce === 0) {
      setLoading(false)
      return
    }
    if (!hit) setLoading(true)
    fetcherRef
      .current()
      .then((d) => {
        if (seq !== seqRef.current) return
        writeCache(key, d)
        setData(d)
        setError('')
      })
      .catch((e) => {
        if (seq !== seqRef.current) return
        // 有旧数据时保留旧数据，不覆盖成错误态
        if (!hit) setError(readableError(e))
      })
      .finally(() => {
        if (seq === seqRef.current) setLoading(false)
      })
    // fetcher 通过 ref 取用，故不列入依赖
  }, [key, ttl, nonce])

  const revalidate = useCallback(() => setNonce((n) => n + 1), [])
  return { data, loading, error, revalidate }
}
