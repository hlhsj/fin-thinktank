import { Link } from 'react-router-dom'
import { ArrowUpRight, Bookmark, Eye, Star, TrendingDown, TrendingUp } from 'lucide-react'
import type { ArticleRow } from '../lib/types'
import { moduleMeta, safeList } from '../lib/types'
import { cn, formatDate, readingMinutes, relativeTime } from '../lib/utils'
import { displaySrc } from '../services/storage'
import { SmartImage, toPlainText } from './Markdown'

export function ModuleBadge({ module, className }: { module: ArticleRow['module']; className?: string }) {
  const meta = moduleMeta(module)
  return (
    <span
      className={cn('chip', className)}
      style={{
        color: meta.accent,
        borderColor: `color-mix(in srgb, ${meta.accent} 27%, transparent)`,
        background: `color-mix(in srgb, ${meta.accent} 8%, transparent)`,
      }}
    >
      {meta.label}
    </span>
  )
}

export function ArticleCover({
  article,
  className,
  ratio = 'aspect-[16/9]',
}: {
  article: ArticleRow
  className?: string
  ratio?: string
}) {
  const src = displaySrc(article.cover_url)
  if (!src) {
    return (
      <div
        className={cn('flex items-center justify-center bg-gradient-to-br from-ink-800 to-ink-900', ratio, className)}
      >
        <span className="serif text-[26px] text-ink-600">
          {moduleMeta(article.module).label.slice(0, 1)}
        </span>
      </div>
    )
  }
  return <SmartImage src={src} alt={article.title} className={cn(ratio, 'w-full object-cover', className)} />
}

export function ArticleCard({
  article,
  favorite = false,
  onToggleFavorite,
  busyFavorite = false,
  canManage = false,
  onEdit,
  onDelete,
}: {
  article: ArticleRow
  favorite?: boolean
  onToggleFavorite?: (id: number) => void
  busyFavorite?: boolean
  canManage?: boolean
  onEdit?: (id: number) => void
  onDelete?: (id: number) => void
}) {
  const body = article.content ?? ''
  const summary = article.summary?.trim() || toPlainText(body, 150)
  const metrics = safeList(article.metrics)
  const tags = safeList(article.tags)

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 transition duration-200 hover:-translate-y-0.5 hover:border-ink-600 hover:shadow-[0_22px_50px_-30px_var(--shadow-tint)]">
      <Link to={`/library/${article.id}`} className="block">
        <ArticleCover article={article} className="transition duration-500 group-hover:scale-[1.015]" />
      </Link>

      {article.featured ? (
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-ink-950/80 px-2 py-0.5 text-[11px] text-gold-soft">
          <Star size={11} /> 精选
        </span>
      ) : null}

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-center gap-2">
          <ModuleBadge module={article.module} />
          {article.status === 'draft' ? (
            <span className="chip border-mist-700/40 text-mist-500">草稿</span>
          ) : null}
          {article.module === 'company' && article.ticker ? (
            <span className="chip font-mono-cn">{article.ticker}</span>
          ) : null}
          {article.module === 'briefing' && article.issue_date ? (
            <span className="chip">{formatDate(article.issue_date)}</span>
          ) : null}
        </div>

        <Link to={`/library/${article.id}`}>
          <h3 className="serif line-clamp-2 text-[16.5px] leading-snug text-mist-100 transition group-hover:text-gold-soft">
            {article.title}
          </h3>
        </Link>

        {summary ? (
          <p className="line-clamp-2 text-[12.8px] leading-relaxed text-mist-500">{summary}</p>
        ) : null}

        {metrics.length ? (
          <div className="flex flex-wrap gap-1.5">
            {metrics.slice(0, 3).map((metric, index) => (
              <span
                key={`${metric?.label ?? index}-${index}`}
                className="inline-flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-850 px-2 py-1 text-[11.5px]"
              >
                <span className="text-mist-700">{metric.label}</span>
                <span
                  className={cn(
                    'font-medium',
                    metric.trend === 'up' ? 'text-up' : metric.trend === 'down' ? 'text-down' : 'text-mist-300',
                  )}
                >
                  {metric.value}
                </span>
                {metric.trend === 'up' ? <TrendingUp size={11} className="text-up" /> : null}
                {metric.trend === 'down' ? <TrendingDown size={11} className="text-down" /> : null}
              </span>
            ))}
          </div>
        ) : null}

        {tags.length ? (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 4).map((tag) => (
              <span key={tag} className="text-[11.5px] text-mist-700">
                #{tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-auto flex items-center justify-between border-t border-ink-700 pt-2.5 text-[11.5px] text-mist-700">
          <span className="truncate">
            {article.owner_name || '匿名研究员'} · {relativeTime(article.updated_at)}
          </span>
          <span className="flex items-center gap-2.5">
            <span>{readingMinutes(body)} 分钟</span>
            <span className="flex items-center gap-1">
              <Eye size={11} />
              {article.read_count ?? 0}
            </span>
          </span>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-[46px] right-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
        <span className="pointer-events-auto">
          <button
            type="button"
            onClick={() => onToggleFavorite?.(article.id)}
            disabled={busyFavorite}
            title={favorite ? '取消收藏' : '收藏'}
            className={cn(
              'rounded-lg border border-ink-700 bg-ink-900/90 p-1.5 transition',
              favorite ? 'text-gold' : 'text-mist-500 hover:text-mist-100',
            )}
          >
            <Bookmark size={13} fill={favorite ? 'currentColor' : 'none'} />
          </button>
        </span>
        {canManage ? (
          <span className="pointer-events-auto">
            <button
              type="button"
              onClick={() => onEdit?.(article.id)}
              title="编辑"
              className="rounded-lg border border-ink-700 bg-ink-900/90 p-1.5 text-mist-500 transition hover:text-mist-100"
            >
              <ArrowUpRight size={13} />
            </button>
          </span>
        ) : null}
      </div>
      {canManage && onDelete ? (
        <RowDeleteButton id={article.id} onDelete={onDelete} />
      ) : null}
    </article>
  )
}

function RowDeleteButton({ id, onDelete }: { id: number; onDelete: (id: number) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onDelete(id)
      }}
      className="absolute left-3 top-3 hidden rounded-full border border-up/40 bg-ink-950/85 px-2 py-0.5 text-[11px] text-up opacity-0 transition group-hover:opacity-100"
    >
      删除
    </button>
  )
}

export function ArticleRowItem({
  article,
  onClick,
}: {
  article: ArticleRow
  onClick: () => void
}) {
  const meta = moduleMeta(article.module)
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-ink-700 hover:bg-ink-850"
    >
      <span
        className="mt-1 h-2 w-2 shrink-0 rounded-full"
        style={{ background: meta.accent }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] text-mist-100">{article.title}</span>
        <span className="mt-0.5 block truncate text-[11.5px] text-mist-700">
          {meta.label} · {relativeTime(article.created_at)}
        </span>
      </span>
    </button>
  )
}
