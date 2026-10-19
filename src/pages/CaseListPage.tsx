/**
 * ── 文件：src/pages/CaseListPage.tsx ────────────────────────────
 * 功能：经典案例分析列表：状态标签（未解锁 / 可看 / 已结束）+ 倒计时。
 * 数据：listCases。
 * 改动指引：
 *   1. 改状态文案 / 配色 → STATUS_TEXT；
 *   2. 改倒计时口径（按天 / 按小时）→ countdown()；
 *   3. 改卡片布局 → 列表项结构。
 */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleDot, PlayCircle, Timer } from 'lucide-react'
import { Card, PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/ui'
import { cn, formatDateTime, readableError } from '../lib/utils'
import { listCases, type CaseRow } from '../services/content'

const STATUS_TEXT: Record<string, { label: string; tone: string }> = {
  live: { label: '直播中', tone: 'text-up' },
  ended: { label: '回放可看', tone: 'text-mist-400' },
  upcoming: { label: '未开始', tone: 'text-gold' },
}

function countdown(target?: string | null) {
  if (!target) return null
  const diff = new Date(target).getTime() - Date.now()
  if (diff <= 0) return null
  const days = Math.floor(diff / 864e5)
  const hours = Math.floor((diff % 864e5) / 36e5)
  if (days > 0) return `${days} 天 ${hours} 小时后开播`
  const mins = Math.floor((diff % 36e5) / 6e4)
  return `${hours} 小时 ${mins} 分钟后开播`
}

/** 经典案例列表：解锁状态 + 倒计时。 */
export function CaseListPage() {
  const [rows, setRows] = useState<CaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setRows(await listCases())
    } catch (err) {
      setError(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Case Study" title="经典案例分析" desc="经典案例研报，点击进入查看完整文档。" />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-52 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState title="加载失败" desc={error} />
      ) : rows.length === 0 ? (
        <EmptyState title="还没有案例" desc="经典案例由讲师整理后发布。" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => {
            const status = STATUS_TEXT[row.status] ?? STATUS_TEXT.ended
            const left = countdown(row.start_at)
            return (
              <Link
                key={row.id}
                to={`/member/replay/${row.id}`}
                className="group overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 transition hover:border-ink-600"
              >
                <div className="flex aspect-[16/9] items-center justify-center bg-ink-850">
                  <PlayCircle size={34} className="text-mist-700 transition group-hover:text-gold" />
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 text-[11.5px]">
                    <CircleDot size={11} className={status.tone} />
                    <span className={status.tone}>{status.label}</span>
                    {row.duration ? <span className="text-mist-700">· {row.duration}</span> : null}
                  </div>
                  <h3 className="mt-2 text-[14.5px] leading-snug text-mist-100 group-hover:text-gold-soft">
                    {row.title}
                  </h3>
                  {row.summary ? (
                    <p className="mt-1.5 line-clamp-2 text-[12px] text-mist-600">{row.summary}</p>
                  ) : null}
                  {left ? (
                    <p className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-gold">
                      <Timer size={12} />
                      {left}
                    </p>
                  ) : (
                    <p className="mt-2.5 text-[11.5px] text-mist-700">{formatDateTime(row.start_at)}</p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <Card className={cn('text-[12px] leading-relaxed text-mist-700')}>
        已结束场次展示「看回放」，未到开播时间展示倒计时。
      </Card>
    </div>
  )
}
