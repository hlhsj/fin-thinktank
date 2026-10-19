/**
 * ── 文件：src/pages/ReviewPage.tsx ──────────────────────────────
 * 功能：复盘文档库列表（按周组织，显示日期与摘要）。
 * 数据：listReviews。
 * 改动指引：
 *   1. 改卡片信息 → 列表项里的 meta 行；
 *   2. 改排序 / 过滤 → 组件内对 rows 的 sort / filter；
 *   3. 内容维护 → 后台 ReviewPanel。
 */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, FileText } from 'lucide-react'
import { Card, PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/ui'
import { cn, formatDate } from '../lib/utils'
import { readableError } from '../lib/utils'
import { listReviews, type ReviewRow } from '../services/content'

/** 复盘文档列表（按周组织）。 */
export function ReviewPage() {
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setRows(await listReviews())
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
      <PageHeader
        eyebrow="Weekly Review"
        title="复盘文档库"
        desc="每周市场复盘，点击标题阅读全文，支持历史归档。"
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState title="加载失败" desc={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileText size={19} />}
          title="还没有复盘文档"
          desc="每周复盘发布后会按周次倒序展示在这里。"
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <Link
              key={row.id}
              to={`/member/review/${row.id}`}
              className={cn(
                'block rounded-2xl border bg-ink-900 p-4 transition hover:border-ink-600 md:p-5',
                index === 0 ? 'border-gold/30 bg-gold/[0.04]' : 'border-ink-700',
              )}
            >
              <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-mist-700">
                <span className="rounded border border-ink-700 px-1.5 py-0.5">
                  {row.week_label ?? `第 ${row.week_no} 周`}
                </span>
                <span className="flex items-center gap-1">
                  <CalendarDays size={12} />
                  {formatDate(row.published_at)}
                </span>
                {index === 0 ? <span className="text-gold-soft">本周最新</span> : null}
              </div>
              <h2 className="serif mt-2 text-[18px] text-mist-100">{row.title}</h2>
              {row.summary ? (
                <p className="mt-1.5 line-clamp-2 text-[13px] text-mist-500">{row.summary}</p>
              ) : null}
            </Link>
          ))}
        </div>
      )}

      <Card className="text-[12px] leading-relaxed text-mist-700">
        归档规则：每周一份复盘文档，标题进入列表后即刻归档，历史内容始终可查阅。
      </Card>
    </div>
  )
}
