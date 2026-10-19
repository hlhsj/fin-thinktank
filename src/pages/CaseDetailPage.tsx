import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Video } from 'lucide-react'
import { Card } from '../components/PageHeader'
import { useResolvedSrc } from '../components/AssetLink'
import { EmptyState, LoadingBlock } from '../components/ui'
import { MarkdownView } from '../components/Markdown'
import { formatDateTime, readableError } from '../lib/utils'
import { getCase, type CaseRow } from '../services/content'

export function CaseDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [row, setRow] = useState<CaseRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // 后台上传的封面存的是 asset-id 引用，这里解析成可展示的地址
  const coverSrc = useResolvedSrc(row?.cover_url ?? null)

  useEffect(() => {
    if (!id) return
    void (async () => {
      try {
        const found = await getCase(Number(id))
        if (!found) setError('没有找到这个案例')
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
      <div className="mx-auto max-w-4xl">
        <LoadingBlock rows={4} />
      </div>
    )
  }

  if (error || !row) {
    return (
      <EmptyState
        title="没有找到这个案例"
        desc={error || '它可能已被删除。'}
        action={
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/member/replay')}>
            <ArrowLeft size={15} />
            返回案例分析
          </button>
        }
      />
    )
  }

  return (
    <article className="mx-auto max-w-4xl">
      <Link
        to="/member/replay"
        className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] text-mist-500 transition hover:text-mist-100"
      >
        <ArrowLeft size={15} />
        经典案例分析
      </Link>

      <Card padded={false} className="overflow-hidden">
        <div className="flex aspect-video items-center justify-center bg-ink-850">
          {row.replay_url ? (
            <video src={row.replay_url} controls className="h-full w-full" poster={coverSrc ?? undefined} />
          ) : coverSrc ? (
            <img src={coverSrc} alt={row.title} className="h-full w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-mist-700">
              <Video size={30} />
              <span className="text-[12.5px]">回放视频待上传</span>
            </div>
          )}
        </div>
        <div className="p-5">
          <p className="text-[11.5px] text-mist-700">
            {formatDateTime(row.start_at)}
            {row.duration ? ` · ${row.duration}` : ''}
          </p>
          <h1 className="serif mt-1.5 text-[24px] leading-tight text-mist-100">{row.title}</h1>
          {row.summary ? <p className="mt-2.5 text-[13.5px] text-mist-500">{row.summary}</p> : null}

          {row.replay_url ? (
            <a
              href={row.replay_url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost mt-4"
            >
              <ExternalLink size={14} />
              新窗口打开回放
            </a>
          ) : null}

          <hr className="my-5 border-ink-700" />
          {row.content.trim() ? (
            <MarkdownView content={row.content} />
          ) : (
            <p className="py-6 text-center text-[12.5px] text-mist-700">案例文档正文待管理员补充。</p>
          )}
        </div>
      </Card>
    </article>
  )
}
