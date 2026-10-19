/**
 * ── 文件：src/pages/ReviewDetailPage.tsx ────────────────────────
 * 功能：复盘详情页：标题、周期、正文（Markdown）、阅读时长。
 * 数据：getReview(id)。
 * 改动指引：
 *   1. 改顶部信息 → 标题下方 meta 区；
 *   2. 加上一篇 / 下一篇 → 在 getReview 之外再取相邻周次；
 *   3. 改正文渲染 → MarkdownView（样式在 Markdown.tsx）。
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import { Card } from '../components/PageHeader'
import { EmptyState, LoadingBlock } from '../components/ui'
import { MarkdownView } from '../components/Markdown'
import { formatDate, readableError } from '../lib/utils'
import { getReview, type ReviewRow } from '../services/content'

/** 复盘详情：正文 + 阅读时长。 */
export function ReviewDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [row, setRow] = useState<ReviewRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    void (async () => {
      try {
        const found = await getReview(Number(id))
        if (!found) setError('没有找到这篇复盘文档')
        else setRow(found)
      } catch (err) {
        setError(readableError(err))
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <LoadingBlock rows={4} />
      </div>
    )
  }

  if (error || !row) {
    return (
      <EmptyState
        title="没有找到这篇复盘"
        desc={error || '它可能已被删除或尚未发布。'}
        action={
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/member/review')}>
            <ArrowLeft size={15} />
            返回复盘文档库
          </button>
        }
      />
    )
  }

  return (
    <article className="mx-auto max-w-3xl">
      <Link
        to="/member/review"
        className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] text-mist-500 transition hover:text-mist-100"
      >
        <ArrowLeft size={15} />
        复盘文档库
      </Link>

      <Card>
        <p className="flex flex-wrap items-center gap-2 text-[11.5px] text-mist-700">
          <span className="rounded border border-ink-700 px-1.5 py-0.5">
            {row.week_label ?? `第 ${row.week_no} 周`}
          </span>
          <span className="flex items-center gap-1">
            <CalendarDays size={12} />
            {formatDate(row.published_at)}
          </span>
        </p>
        <h1 className="serif mt-2.5 text-[26px] leading-tight text-mist-100">{row.title}</h1>
        {row.summary ? <p className="mt-3 text-[13.5px] text-mist-500">{row.summary}</p> : null}
        <hr className="my-5 border-ink-700" />
        {row.content.trim() ? (
          <MarkdownView content={row.content} />
        ) : (
          <p className="py-6 text-center text-[12.5px] text-mist-700">本复盘正文待管理员发布。</p>
        )}
      </Card>
    </article>
  )
}
