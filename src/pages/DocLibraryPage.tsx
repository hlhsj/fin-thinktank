/**
 * ── 文件：src/pages/DocLibraryPage.tsx ──────────────────────────
 * 功能：学习资料库：章节树 + Markdown 正文 + 术语表（glossary）检索。
 * 数据：listChapters、listGlossary。
 * 改动指引：
 *   1. 改章节分组 / 排序 → 组件内 chapters 的排序逻辑；
 *   2. 加正文目录 → 用 lib/utils 的 extractHeadings；
 *   3. 改术语表展示 → listGlossary 返回值渲染区。
 * 注意：本页只读，章节内容维护在后台 AdminContent 的 DocPanel。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, Bookmark, Search } from 'lucide-react'
import { Card, PageHeader, PendingContent } from '../components/PageHeader'
import { EmptyState, Spinner } from '../components/ui'
import { MarkdownView } from '../components/Markdown'
import { cn, formatDate, readableError } from '../lib/utils'
import { listChapters, listGlossary, type ChapterRow, type GlossaryRow } from '../services/content'
import { useAuth } from '../context/AuthContext'

type Tab = 'chapters' | 'glossary'

/** 学习资料库：章节树 + Markdown 正文 + 术语表检索。 */
export function DocLibraryPage() {
  // 章节正文属付费内容：读取需带登录时签发的服务端令牌（见 AuthContext）
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('chapters')
  const [chapters, setChapters] = useState<ChapterRow[]>([])
  const [glossary, setGlossary] = useState<GlossaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  /** 智库百科当前分类：空字符串 = 全部 */
  const [termCat, setTermCat] = useState('')
  const [activeId, setActiveId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const [list, terms] = await Promise.all([
        listChapters({ uid: user?.id ?? '', token: user?.token ?? null }),
        listGlossary(),
      ])
      setChapters(list)
      setGlossary(terms)
      if (list.length) setActiveId(list[0].id)
    } catch (err) {
      const msg = readableError(err)
      setError(
        /NO_ENTITLEMENT/.test(msg)
          ? '学习资料库为学员专属内容，需要有效的学员权益（可在「我的」页面查看或续费）。'
          : msg,
      )
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  const roots = chapters.filter((c) => !c.parent_id)
  /** 顶层节点中的「章」数量（「引言」等非章节点不计入，「第X章」才算） */
  const chapterRoots = roots.filter((r) => /^第.+章/.test(r.title.trim()))
  const active = chapters.find((c) => c.id === activeId) ?? null
  const activeSections = active ? chapters.filter((c) => c.parent_id === active.id) : []

  /** 智库百科分类（含条数），空分类归入「未分类」 */
  const categories = useMemo(() => {
    const map = new Map<string, number>()
    glossary.forEach((g) => {
      const c = (g.category || '').trim() || '未分类'
      map.set(c, (map.get(c) ?? 0) + 1)
    })
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
  }, [glossary])

  const filteredTerms = useMemo(() => {
    const q = keyword.trim()
    return glossary.filter((g) => {
      if (termCat && ((g.category || '').trim() || '未分类') !== termCat) return false
      if (!q) return true
      return g.term.includes(q) || g.explanation.includes(q) || g.category.includes(q)
    })
  }, [glossary, keyword, termCat])

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Learning Library"
        title="学习资料库"
        desc="体系化教程 + 智库百科，持续更新。"
        right={
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mist-700" />
            <input
              className="field w-56 pl-9"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索章节或百科词条"
              aria-label="搜索"
            />
          </div>
        }
      />

      <div className="flex gap-1">
        {(
          [
            { key: 'chapters', label: `章节目录（${chapterRoots.length} 章）` },
            { key: 'glossary', label: `智库百科（${glossary.length} 条）` },
          ] as Array<{ key: Tab; label: string }>
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-[13px] transition',
              tab === item.key ? 'bg-gold/12 text-gold-soft' : 'text-mist-500 hover:bg-ink-850',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 智库百科：按分类筛选 */}
      {tab === 'glossary' && categories.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-mist-700">分类</span>
          {[{ name: '', count: glossary.length }, ...categories.map(([name, count]) => ({ name, count }))].map(
            (c) => (
              <button
                key={c.name || '__all__'}
                type="button"
                onClick={() => setTermCat(c.name)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-[12.5px] transition',
                  termCat === c.name
                    ? 'border-gold/45 bg-gold/12 text-gold-soft'
                    : 'border-ink-700 text-mist-500 hover:text-mist-300',
                )}
              >
                {c.name || '全部'}
                <span className="ml-1 tabular-nums text-[11px] text-mist-700">{c.count}</span>
              </button>
            ),
          )}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-[280px_1fr]">
          <div className="skeleton h-64 rounded-2xl" />
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      ) : error ? (
        <EmptyState title="加载失败" desc={error} />
      ) : tab === 'chapters' ? (
        <>
          {roots.length === 0 ? (
            <PendingContent hint="7 章体系已规划完成，正文由管理员在后台逐章补充。" />
          ) : (
            <div className="grid gap-4 md:grid-cols-[300px_1fr]">
              <Card padded={false} className="overflow-hidden">
                <nav className="max-h-[68vh] overflow-y-auto p-2">
                  {roots.map((chapter) => {
                    const sections = chapters.filter((c) => c.parent_id === chapter.id)
                    const isOpen = activeId === chapter.id || active?.parent_id === chapter.id
                    return (
                      <div key={chapter.id} className="mb-0.5">
                        <button
                          type="button"
                          onClick={() => setActiveId(chapter.id)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition',
                            activeId === chapter.id
                              ? 'bg-gold/12 text-gold-soft'
                              : 'text-mist-300 hover:bg-ink-850',
                          )}
                        >
                          <BookOpen size={14} className={isOpen ? 'text-gold' : 'text-mist-700'} />
                          <span className="flex-1 truncate">{chapter.title}</span>
                          {sections.length ? (
                            <span className="text-[10.5px] text-mist-700">{sections.length}</span>
                          ) : null}
                        </button>
                        {isOpen && sections.length ? (
                          <div className="ml-6 border-l border-ink-700 pl-2">
                            {sections.map((sec) => (
                              <button
                                key={sec.id}
                                type="button"
                                onClick={() => setActiveId(sec.id)}
                                className={cn(
                                  'block w-full truncate rounded-md px-2 py-1.5 text-left text-[12.5px] transition',
                                  activeId === sec.id ? 'text-gold-soft' : 'text-mist-600 hover:text-mist-300',
                                )}
                              >
                                {sec.title}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </nav>
              </Card>

              <Card>
                {active ? (
                  <>
                    <p className="text-[11.5px] text-mist-700">
                      {active.parent_id
                        ? chapters.find((c) => c.id === active.parent_id)?.title ?? '章节'
                        : active.title.trim().split(/\s+/)[0] || '章节'}
                      {' · 最近更新 '}
                      {formatDate(active.updated_at)}
                    </p>
                    <h2 className="serif mt-1 text-[20px] text-mist-100">{active.title}</h2>
                    {active.summary ? (
                      <div className="mt-2">
                        <MarkdownView content={active.summary} className="md-summary" />
                      </div>
                    ) : null}
                    <hr className="my-4 border-ink-700" />
                    {active.content.trim() ? (
                      <MarkdownView content={active.content} />
                    ) : (
                      <PendingContent hint="本章正文待管理员补充。" />
                    )}
                    {!active.parent_id && activeSections.length ? (
                      <div className="mt-6 border-t border-ink-700 pt-4">
                        <p className="mb-2 text-[12.5px] text-mist-500">本章小节</p>
                        <div className="flex flex-wrap gap-2">
                          {activeSections.map((sec) => (
                            <button
                              key={sec.id}
                              type="button"
                              onClick={() => setActiveId(sec.id)}
                              className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 text-[12.5px] text-mist-300 transition hover:border-ink-600"
                            >
                              {sec.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <PendingContent />
                )}
              </Card>
            </div>
          )}
        </>
      ) : filteredTerms.length === 0 ? (
        glossary.length === 0 ? (
          <EmptyState icon={<Bookmark size={19} />} title="还没有词条" desc="由管理员在后台维护智库百科。" />
        ) : (
          <EmptyState
            icon={<Bookmark size={19} />}
            title="没有匹配的词条"
            desc="试试更换关键词或清除分类筛选。"
          />
        )
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredTerms.map((term) => (
            <Card key={term.id}>
              <div className="flex items-baseline gap-2">
                <p className="text-[14px] text-mist-100">{term.term}</p>
                <span className="rounded border border-ink-700 px-1.5 py-0.5 text-[10.5px] text-mist-700">
                  {term.category}
                </span>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-mist-500">{term.explanation}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
