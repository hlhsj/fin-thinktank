/**
 * ── 文件：src/components/Markdown.tsx ───────────────────────────
 * 功能：Markdown 渲染（GFM 表格、代码高亮、图片走 SmartImage），以及纯文本摘要 toPlainText。
 * 改动指引：
 *   1. 加 Markdown 语法 → 往 react-markdown 的 remarkPlugins / rehypePlugins 追加；
 *   2. 改代码块配色 → src/index.css 的 highlight.js 段；
 *   3. 改图片加载策略 → SmartImage（懒加载 / 失败占位）；
 *   4. 目录锚点 → 与 lib/utils 的 extractHeadings / slugHeading 保持同一套规则，否则跳转会错位。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { ImageOff } from 'lucide-react'
import { isAssetRef, peekAssetUrl, resolveAssetUrl, stripAssetRef } from '../services/storage'
import { cn, slugHeading } from '../lib/utils'

/** 支持 asset-id:// 引用的图片：渲染时才从云端数据库取回内容，并缓存复用 */
export function SmartImage({ src, alt, className }: { src?: string; alt?: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(() =>
    src && isAssetRef(src) ? peekAssetUrl(stripAssetRef(src)) : src ?? null,
  )
  const [failed, setFailed] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    setFailed(false)
    if (!src) return
    if (!isAssetRef(src)) {
      setUrl(src)
      return
    }
    const path = stripAssetRef(src)
    setUrl(peekAssetUrl(path))
    void resolveAssetUrl(path).then((resolved) => {
      if (!alive.current) return
      if (!resolved) setFailed(true)
      else setUrl(resolved)
    })
  }, [src])

  if (!src || failed) {
    return (
      <span className="my-2 flex items-center gap-2 rounded-xl border border-dashed border-ink-700 bg-ink-850 px-3 py-2.5 text-[12.5px] text-mist-700">
        <ImageOff size={15} />
        {alt || '图片不可用（可能已删除或无访问权限）'}
      </span>
    )
  }
  if (!url) {
    return <span className="skeleton my-2 block h-40 rounded-xl" />
  }
  return (
    <img
      src={url}
      alt={alt ?? ''}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  )
}

/** Markdown 渲染入口（GFM + 代码高亮 + 智能图片）。 */
export function MarkdownView({
  content,
  className,
  compact = false,
}: {
  content: string
  className?: string
  compact?: boolean
}) {
  const components = useMemo(() => {
    let counter = 0
    return {
      img: ({ src, alt }: { src?: string; alt?: string }) => <SmartImage src={src} alt={alt} />,
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
        <a href={href} target="_blank" rel="noreferrer noopener">
          {children}
        </a>
      ),
      h1: ({ children }: { children?: React.ReactNode }) => (
        <h1 id={slugHeading(String(children), counter++)}>{children}</h1>
      ),
      h2: ({ children }: { children?: React.ReactNode }) => (
        <h2 id={slugHeading(String(children), counter++)}>{children}</h2>
      ),
      h3: ({ children }: { children?: React.ReactNode }) => (
        <h3 id={slugHeading(String(children), counter++)}>{children}</h3>
      ),
      h4: ({ children }: { children?: React.ReactNode }) => (
        <h4 id={slugHeading(String(children), counter++)}>{children}</h4>
      ),
      table: ({ children }: { children?: React.ReactNode }) => (
        <div className="not-md my-3 overflow-x-auto rounded-xl border border-ink-700">
          <table>{children}</table>
        </div>
      ),
    }
  }, [])

  return (
    <div className={cn('md-body', compact && 'text-[14px]', className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </Markdown>
    </div>
  )
}

/** 纯文本摘要：去掉 Markdown 标记，用于卡片预览 */
export function toPlainText(markdown: string, max = 160) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`_~\-|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}
