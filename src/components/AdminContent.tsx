import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, ImagePlus, MonitorPlay, Pencil, Plus, Save, Trash2, Upload, X } from 'lucide-react'
import { Card } from '../components/PageHeader'
import { EmptyState, Field, Modal, Spinner, useConfirm } from '../components/ui'
import { MarkdownView } from '../components/Markdown'
import { cn, formatDate, parseVideoUrl, readableError } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { saveAsset } from '../services/assets'
import { MAX_FILE_BYTES, asAssetRef, prepareAsset, resolveAssetUrl, stripAssetRef } from '../services/storage'
import {
  adminClearCompanyResearch,
  adminDeleteCompanyResearch,
  adminDeleteCourseVideo,
  adminDeleteMaterial,
  adminImportCompanyResearch,
  adminSaveCompanyResearch,
  adminSaveCourseVideo,
  adminSaveMaterial,
  adminUpdateMaterial,
  deleteCase,
  deleteChapterAdmin,
  deleteGlossary,
  deleteReview,
  listCases,
  listChapters,
  listCompanyResearch,
  listCourseVideos,
  listGlossary,
  listMaterials,
  listReviews,
  saveCase,
  saveChapterAdmin,
  saveGlossary,
  saveReview,
  updateCase,

  updateGlossary,
  updateReview,
  type CaseRow,
  type ChapterRow,
  type CompanyResearchRow,
  type CourseVideoRow,
  type GlossaryRow,
  type MaterialRow,
  type ReviewRow,
} from '../services/content'

/**
 * 后台内容管理。
 *
 * 文件上传说明：云端对象存储需要云服务会话，而本站是自建账号（无会话）会 401，
 * 所以上传的文件走 asset_blobs 表存库，正文/字段里只留 `asset-id://<id>` 引用，
 * 前台渲染时再还原。大文件建议直接填外链。
 */

/** 上传本地文件 → 落库 → 返回可写进字段的 asset-id 引用 */
async function uploadToRef(ownerId: string, file: File) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`「${file.name}」超过 ${MAX_FILE_BYTES / 1024 / 1024}MB，请压缩后上传或直接填外链`)
  }
  const prepared = await prepareAsset(file)
  const row = await saveAsset(ownerId, {
    file_name: file.name,
    content_type: prepared.contentType,
    size_bytes: prepared.sizeBytes,
    kind: prepared.kind,
    data: prepared.dataUrl,
  })
  return asAssetRef(row.id)
}

/** 图片/文件选择 + 外链两种录入方式 */
function AssetField({
  label,
  hint,
  value,
  onChange,
  accept = 'image/*',
}: {
  label: string
  hint?: string
  value: string
  onChange: (next: string) => void
  accept?: string
}) {
  const { user } = useAuth()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  return (
    <Field label={label} hint={hint ?? '上传 ≤5MB 的文件，或直接填外链'}>
      <div className="space-y-2">
        <input
          className="field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… 或 asset-id://12"
        />
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file || !user) return
              setBusy(true)
              try {
                onChange(await uploadToRef(user.id, file))
                toast.success('文件已上传')
              } catch (err) {
                toast.error(readableError(err))
              } finally {
                setBusy(false)
              }
            }}
          />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Spinner size={13} /> : <Upload size={13} />}
            上传文件
          </button>
          {value ? (
            <button
              type="button"
              className="text-[12px] text-mist-600 hover:text-down"
              onClick={() => onChange('')}
            >
              清空
            </button>
          ) : null}
        </div>
      </div>
    </Field>
  )
}

/** Markdown 编辑区：写作 / 预览切换 */
function MarkdownField({
  label,
  value,
  onChange,
  hint,
  minH = '220px',
  placeholder = '支持 Markdown：## 标题、**加粗**、- 列表、| 表格 |、```代码块```',
  previewClassName,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  hint?: string
  /** 编辑区最小高度：正文用默认 220px，摘要等短文本传小一点的值 */
  minH?: string
  placeholder?: string
  /** 预览区的额外样式类，便于让预览贴近前台实际排版（如摘要传 md-summary） */
  previewClassName?: string
}) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[12.5px] text-mist-400">{label}</span>
        <div className="flex gap-1">
          {(
            [
              { key: 'write', label: '写作' },
              { key: 'preview', label: '预览' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                'rounded px-2 py-0.5 text-[11.5px] transition',
                tab === item.key ? 'bg-gold/12 text-gold-soft' : 'text-mist-600 hover:text-mist-300',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'write' ? (
        <textarea
          className="field resize-y font-mono text-[12.5px] leading-relaxed"
          style={{ minHeight: minH }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <div
          className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-3"
          style={{ minHeight: minH }}
        >
          {value.trim() ? (
            <MarkdownView content={value} className={previewClassName} />
          ) : (
            <p className="text-[12.5px] text-mist-700">还没有内容</p>
          )}
        </div>
      )}
      {hint ? <p className="mt-1 text-[11px] text-mist-700">{hint}</p> : null}
    </div>
  )
}

function RowActions({
  onEdit,
  onDelete,
  editing,
}: {
  onEdit: () => void
  onDelete: () => void
  editing: boolean
}) {
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          'rounded-md border px-2 py-1 text-[11.5px] transition',
          editing
            ? 'border-gold/40 bg-gold/10 text-gold-soft'
            : 'border-ink-700 text-mist-500 hover:text-mist-200',
        )}
      >
        <Pencil size={11} className="mr-1 inline" />
        {editing ? '编辑中' : '编辑'}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-md border border-ink-700 px-2 py-1 text-[11.5px] text-mist-500 transition hover:text-down"
      >
        <Trash2 size={11} className="mr-1 inline" />
        删除
      </button>
    </div>
  )
}

/* ---------------- 学习资料库 ---------------- */

export function DocPanel() {
  const toast = useToast()
  const { confirm, dialog } = useConfirm()
  // 章节读写均需服务端令牌（见 AuthContext 的 AccountSession.token）
  const { user } = useAuth()
  const [chapters, setChapters] = useState<ChapterRow[]>([])
  const [terms, setTerms] = useState<GlossaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sub, setSub] = useState<'chapter' | 'glossary'>('chapter')

  const [editingChapter, setEditingChapter] = useState<ChapterRow | null>(null)
  const [chapterForm, setChapterForm] = useState({
    title: '',
    kind: 'chapter' as ChapterRow['kind'],
    parent_id: '' as string,
    summary: '',
    content: '',
    order_no: '0',
  })

  const [editingTerm, setEditingTerm] = useState<GlossaryRow | null>(null)
  const [termForm, setTermForm] = useState({ term: '', explanation: '', category: '通用', order_no: '0' })
  /** 智库百科：分类筛选（空 = 全部）与关键词搜索 */
  const [termCat, setTermCat] = useState('')
  const [termQuery, setTermQuery] = useState('')

  const load = useCallback(async () => {
    try {
      const [c, g] = await Promise.all([
        listChapters({ uid: user?.id ?? '', token: user?.token ?? null }),
        listGlossary(),
      ])
      setChapters(c)
      setTerms(g)
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [toast, user])

  useEffect(() => {
    void load()
  }, [load])

  const roots = chapters.filter((c) => !c.parent_id)

  const beginChapterEdit = (row: ChapterRow) => {
    setEditingChapter(row)
    setChapterForm({
      title: row.title,
      kind: row.kind,
      parent_id: row.parent_id ? String(row.parent_id) : '',
      summary: row.summary ?? '',
      content: row.content ?? '',
      order_no: String(row.order_no),
    })
  }

  const submitChapter = async () => {
    if (!chapterForm.title.trim()) return toast.error('请填写标题')
    const pid = chapterForm.parent_id ? Number(chapterForm.parent_id) : null
    // 新增且未填排序号时，按「章占十位、小节占个位」自动分配，避免章与小节序号混排
    const raw = chapterForm.order_no.trim()
    let orderNo = raw ? Number(raw) : Number.NaN
    if (!editingChapter && !Number.isFinite(orderNo)) {
      if (!pid) {
        const maxRoot = chapters.filter((c) => !c.parent_id).reduce((m, c) => Math.max(m, c.order_no), 0)
        orderNo = maxRoot + 10
      } else {
        const sibs = chapters.filter((c) => c.parent_id === pid)
        const base = chapters.find((c) => c.id === pid)?.order_no ?? 0
        orderNo = sibs.length ? Math.max(...sibs.map((s) => s.order_no)) + 1 : base + 1
      }
    }
    try {
      const payload = {
        title: chapterForm.title.trim(),
        kind: chapterForm.kind,
        parent_id: pid,
        summary: chapterForm.summary.trim() || null,
        content: chapterForm.content,
        order_no: Number.isFinite(orderNo) ? orderNo : 0,
      }
      if (editingChapter) {
        await saveChapterAdmin({ uid: user?.id ?? '', token: user?.token ?? null }, { ...payload, id: editingChapter.id })
        toast.success('章节已更新')
      } else {
        await saveChapterAdmin({ uid: user?.id ?? '', token: user?.token ?? null }, payload)
        toast.success('章节已创建')
      }
      setEditingChapter(null)
      setChapterForm({ title: '', kind: 'chapter', parent_id: '', summary: '', content: '', order_no: '0' })
      await load()
    } catch (err) {
      toast.error(readableError(err))
    }
  }

  const submitTerm = async () => {
    if (!termForm.term.trim()) return toast.error('请填写术语')
    try {
      const payload = {
        term: termForm.term.trim(),
        explanation: termForm.explanation,
        category: termForm.category.trim() || '通用',
        order_no: Number(termForm.order_no) || 0,
      }
      if (editingTerm) {
        await updateGlossary(editingTerm.id, payload)
        toast.success('术语已更新')
      } else {
        await saveGlossary(payload)
        toast.success('术语已新增')
      }
      setEditingTerm(null)
      setTermForm({ term: '', explanation: '', category: '通用', order_no: '0' })
      await load()
    } catch (err) {
      toast.error(readableError(err))
    }
  }

  /** 智库百科分类（含条数），空分类归入「未分类」 */
  const categories = useMemo(() => {
    const map = new Map<string, number>()
    terms.forEach((t) => {
      const c = (t.category || '').trim() || '未分类'
      map.set(c, (map.get(c) ?? 0) + 1)
    })
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
  }, [terms])

  /** 按分类 + 关键词过滤后的词条，便于管理员在词条较多时定位 */
  const filteredTerms = useMemo(() => {
    const q = termQuery.trim().toLowerCase()
    return terms.filter((t) => {
      if (termCat && ((t.category || '').trim() || '未分类') !== termCat) return false
      if (!q) return true
      return t.term.toLowerCase().includes(q) || t.explanation.toLowerCase().includes(q)
    })
  }, [terms, termQuery, termCat])

  if (loading) return <div className="skeleton h-64 rounded-2xl" />

  return (
    <div className="space-y-4">
      {dialog}
      <div className="flex gap-1.5">
        {(
          [
            { key: 'chapter', label: `章节（${chapters.length}）` },
            { key: 'glossary', label: `智库百科（${terms.length}）` },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setSub(item.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-[12.5px] transition',
              sub === item.key ? 'bg-gold/12 text-gold-soft' : 'text-mist-500 hover:bg-ink-850',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {sub === 'chapter' ? (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <Card padded={false}>
            <div className="max-h-[70vh] overflow-y-auto p-2">
              {chapters.length === 0 ? (
                <p className="px-2 py-6 text-center text-[12.5px] text-mist-700">还没有章节</p>
              ) : (
                chapters.map((row) => (
                  <div
                    key={row.id}
                    className={cn(
                      'mb-1 rounded-lg px-2.5 py-2',
                      editingChapter?.id === row.id ? 'bg-gold/10' : 'hover:bg-ink-850',
                      row.parent_id ? 'ml-4 border-l border-ink-700 pl-3' : '',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-mist-200">{row.title}</p>
                        <p className="text-[11px] text-mist-700">
                          {row.kind === 'chapter' ? '章' : '小节'} · 序 {row.order_no} ·{' '}
                          {row.content.trim() ? '有正文' : '正文待补'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-1.5">
                      <RowActions
                        editing={editingChapter?.id === row.id}
                        onEdit={() => beginChapterEdit(row)}
                        onDelete={async () => {
                          const ok = await confirm({
                            title: '删除章节',
                            message: `确定删除「${row.title}」？其下小节会一并删除。`,
                            confirmText: '确认删除',
                          })
                          if (!ok) return
                          try {
                            await deleteChapterAdmin({ uid: user?.id ?? '', token: user?.token ?? null }, row.id)
                            toast.success('已删除')
                            await load()
                          } catch (err) {
                            toast.error(readableError(err))
                          }
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <p className="mb-3 text-[13.5px] text-mist-100">
              {editingChapter ? `编辑：${editingChapter.title}` : '新增章节 / 小节'}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="标题">
                <input
                  className="field"
                  value={chapterForm.title}
                  onChange={(e) => setChapterForm({ ...chapterForm, title: e.target.value })}
                  placeholder="第 1 章 · 认识市场"
                />
              </Field>
              <Field label="层级">
                <select
                  className="field"
                  value={chapterForm.kind}
                  onChange={(e) =>
                    setChapterForm({ ...chapterForm, kind: e.target.value as ChapterRow['kind'] })
                  }
                >
                  <option value="chapter">章</option>
                  <option value="section">小节</option>
                </select>
              </Field>
              <Field label="所属章" hint="小节才需要选">
                <select
                  className="field"
                  value={chapterForm.parent_id}
                  onChange={(e) => setChapterForm({ ...chapterForm, parent_id: e.target.value })}
                >
                  <option value="">（作为章）</option>
                  {roots.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="排序号">
                <input
                  className="field"
                  inputMode="numeric"
                  value={chapterForm.order_no}
                  onChange={(e) =>
                    setChapterForm({ ...chapterForm, order_no: e.target.value.replace(/\D/g, '') })
                  }
                />
              </Field>
            </div>
            <div className="mt-3">
              <MarkdownField
                label="摘要"
                value={chapterForm.summary}
                onChange={(next) => setChapterForm({ ...chapterForm, summary: next })}
                minH="96px"
                previewClassName="md-summary"
                placeholder="支持 Markdown：一句话说明这章讲什么，如 **重点**：……"
                hint="前台按 Markdown 渲染，可写加粗、列表、链接；留空则前台不显示摘要"
              />
            </div>
            <div className="mt-3">
              <MarkdownField
                label="正文"
                value={chapterForm.content}
                onChange={(next) => setChapterForm({ ...chapterForm, content: next })}
                hint="留空则前台显示「待补充」，不影响目录结构"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn btn-primary" onClick={submitChapter}>
                <Save size={14} />
                {editingChapter ? '保存修改' : '创建'}
              </button>
              {editingChapter ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditingChapter(null)
                    setChapterForm({
                      title: '',
                      kind: 'chapter',
                      parent_id: '',
                      summary: '',
                      content: '',
                      order_no: '0',
                    })
                  }}
                >
                  <X size={14} />
                  取消编辑
                </button>
              ) : null}
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <Card padded={false}>
            {/* 关键词搜索 + 分类筛选 */}
            <div className="border-b border-ink-700 p-2">
              <input
                className="field mb-2"
                value={termQuery}
                onChange={(e) => setTermQuery(e.target.value)}
                placeholder="搜索词条名或解释"
                aria-label="搜索词条"
              />
              <div className="flex flex-wrap gap-1.5">
                {[{ name: '', count: terms.length }, ...categories.map(([name, count]) => ({ name, count }))].map(
                  (c) => (
                    <button
                      key={c.name || '__all__'}
                      type="button"
                      onClick={() => setTermCat(c.name)}
                      className={cn(
                        'rounded-md border px-2 py-1 text-[11.5px] transition',
                        termCat === c.name
                          ? 'border-gold/45 bg-gold/12 text-gold-soft'
                          : 'border-ink-700 text-mist-500 hover:text-mist-300',
                      )}
                    >
                      {c.name || '全部'}
                      <span className="ml-1 tabular-nums text-mist-700">{c.count}</span>
                    </button>
                  ),
                )}
              </div>
            </div>
            <div className="max-h-[58vh] overflow-y-auto p-2">
              {filteredTerms.length === 0 ? (
                <p className="px-2 py-6 text-center text-[12.5px] text-mist-700">
                  {terms.length === 0 ? '还没有词条' : '没有匹配的词条'}
                </p>
              ) : (
                filteredTerms.map((row) => (
                  <div
                    key={row.id}
                    className={cn(
                      'mb-1 rounded-lg px-2.5 py-2',
                      editingTerm?.id === row.id ? 'bg-gold/10' : 'hover:bg-ink-850',
                    )}
                  >
                    <p className="truncate text-[13px] text-mist-200">{row.term}</p>
                    <p className="text-[11px] text-mist-700">{row.category}</p>
                    <div className="mt-1.5">
                      <RowActions
                        editing={editingTerm?.id === row.id}
                        onEdit={() => {
                          setEditingTerm(row)
                          setTermForm({
                            term: row.term,
                            explanation: row.explanation,
                            category: row.category,
                            order_no: String(row.order_no),
                          })
                        }}
                        onDelete={async () => {
                          const ok = await confirm({
                            title: '删除词条',
                            message: `确定删除词条「${row.term}」？`,
                            confirmText: '确认删除',
                          })
                          if (!ok) return
                          try {
                            await deleteGlossary(row.id)
                            toast.success('已删除')
                            await load()
                          } catch (err) {
                            toast.error(readableError(err))
                          }
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
          <Card>
            <p className="mb-3 text-[13.5px] text-mist-100">
              {editingTerm ? `编辑：${editingTerm.term}` : '新增词条'}
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="术语">
                <input
                  className="field"
                  value={termForm.term}
                  onChange={(e) => setTermForm({ ...termForm, term: e.target.value })}
                />
              </Field>
              <Field label="分类">
                <input
                  className="field"
                  list="glossary-category-options"
                  value={termForm.category}
                  onChange={(e) => setTermForm({ ...termForm, category: e.target.value })}
                />
              </Field>
              <datalist id="glossary-category-options">
                {categories.map(([name]) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <Field label="排序号">
                <input
                  className="field"
                  inputMode="numeric"
                  value={termForm.order_no}
                  onChange={(e) => setTermForm({ ...termForm, order_no: e.target.value.replace(/\D/g, '') })}
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="解释">
                <textarea
                  className="field min-h-[120px] resize-y"
                  value={termForm.explanation}
                  onChange={(e) => setTermForm({ ...termForm, explanation: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn btn-primary" onClick={submitTerm}>
                <Save size={14} />
                {editingTerm ? '保存修改' : '创建'}
              </button>
              {editingTerm ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditingTerm(null)
                    setTermForm({ term: '', explanation: '', category: '通用', order_no: '0' })
                  }}
                >
                  <X size={14} />
                  取消编辑
                </button>
              ) : null}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

/* ---------------- 复盘文档库 ---------------- */

export function ReviewPanel() {
  const toast = useToast()
  const { confirm, dialog } = useConfirm()
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<ReviewRow | null>(null)
  const empty = {
    week_no: String((rows[0]?.week_no ?? 0) + 1),
    week_label: '',
    title: '',
    summary: '',
    content: '',
    published_at: new Date().toISOString().slice(0, 10),
  }
  const [form, setForm] = useState(empty)

  const load = useCallback(async () => {
    try {
      setRows(await listReviews())
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async () => {
    if (!form.title.trim()) return toast.error('请填写标题')
    try {
      const payload = {
        week_no: Number(form.week_no) || 0,
        week_label: form.week_label.trim() || null,
        title: form.title.trim(),
        summary: form.summary.trim() || null,
        content: form.content,
        published_at: form.published_at || null,
      }
      if (editing) {
        await updateReview(editing.id, payload)
        toast.success('复盘已更新')
      } else {
        await saveReview(payload)
        toast.success('复盘已发布')
      }
      setEditing(null)
      setForm({ ...empty, week_no: String((Number(form.week_no) || 0) + 1) })
      await load()
    } catch (err) {
      toast.error(readableError(err))
    }
  }

  if (loading) return <div className="skeleton h-64 rounded-2xl" />

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card padded={false}>
        <div className="max-h-[70vh] overflow-y-auto p-2">
          {dialog}
          {rows.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12.5px] text-mist-700">还没有复盘文档</p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className={cn(
                  'mb-1 rounded-lg px-2.5 py-2',
                  editing?.id === row.id ? 'bg-gold/10' : 'hover:bg-ink-850',
                )}
              >
                <p className="truncate text-[13px] text-mist-200">{row.title}</p>
                <p className="text-[11px] text-mist-700">
                  {row.week_label ?? `第 ${row.week_no} 周`} · {formatDate(row.published_at)}
                </p>
                <div className="mt-1.5">
                  <RowActions
                    editing={editing?.id === row.id}
                    onEdit={() => {
                      setEditing(row)
                      setForm({
                        week_no: String(row.week_no),
                        week_label: row.week_label ?? '',
                        title: row.title,
                        summary: row.summary ?? '',
                        content: row.content ?? '',
                        published_at: row.published_at ?? '',
                      })
                    }}
                    onDelete={async () => {
                      const ok = await confirm({
                        title: '删除复盘文档',
                        message: `确定删除「${row.title}」？`,
                        confirmText: '确认删除',
                      })
                      if (!ok) return
                      try {
                        await deleteReview(row.id)
                        toast.success('已删除')
                        await load()
                      } catch (err) {
                        toast.error(readableError(err))
                      }
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-[13.5px] text-mist-100">{editing ? `编辑：${editing.title}` : '发布新复盘'}</p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="周次">
            <input
              className="field"
              inputMode="numeric"
              value={form.week_no}
              onChange={(e) => setForm({ ...form, week_no: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label="周标签" hint="留空显示「第 N 周」">
            <input
              className="field"
              value={form.week_label}
              onChange={(e) => setForm({ ...form, week_label: e.target.value })}
              placeholder="2026 第 41 周"
            />
          </Field>
          <Field label="发布日期">
            <input
              className="field"
              type="date"
              value={form.published_at}
              onChange={(e) => setForm({ ...form, published_at: e.target.value })}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="标题">
            <input
              className="field"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="本周市场复盘"
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="摘要">
            <input
              className="field"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
          </Field>
        </div>
        <div className="mt-3">
          <MarkdownField
            label="正文"
            value={form.content}
            onChange={(next) => setForm({ ...form, content: next })}
          />
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-primary" onClick={submit}>
            <Save size={14} />
            {editing ? '保存修改' : '发布'}
          </button>
          {editing ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setEditing(null)
                setForm(empty)
              }}
            >
              <X size={14} />
              取消编辑
            </button>
          ) : null}
        </div>
      </Card>
    </div>
  )
}

/* ---------------- 经典案例分析 ---------------- */

export function CasePanel() {
  const toast = useToast()
  const { confirm, dialog } = useConfirm()
  const [rows, setRows] = useState<CaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<CaseRow | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const empty = {
    title: '',
    summary: '',
    content: '',
    status: 'ended' as CaseRow['status'],
    start_at: '',
    duration: '',
    replay_url: '',
    cover_url: '',
    order_no: '0',
  }
  const [form, setForm] = useState(empty)

  const load = useCallback(async () => {
    try {
      setRows(await listCases())
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const openPreview = async (src: string) => {
    if (!src) return
    if (src.startsWith('http')) return window.open(src, '_blank')
    setPreview(await resolveAssetUrl(stripAssetRef(src)))
  }

  const submit = async () => {
    if (!form.title.trim()) return toast.error('请填写标题')
    try {
      const payload = {
        title: form.title.trim(),
        summary: form.summary.trim() || null,
        content: form.content,
        status: form.status,
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        duration: form.duration.trim() || null,
        replay_url: form.replay_url.trim() || null,
        cover_url: form.cover_url.trim() || null,
        order_no: Number(form.order_no) || 0,
      }
      if (editing) {
        await updateCase(editing.id, payload)
        toast.success('案例已更新')
      } else {
        await saveCase(payload)
        toast.success('案例已创建')
      }
      setEditing(null)
      setForm(empty)
      await load()
    } catch (err) {
      toast.error(readableError(err))
    }
  }

  if (loading) return <div className="skeleton h-64 rounded-2xl" />

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card padded={false}>
        <div className="max-h-[70vh] overflow-y-auto p-2">
          {dialog}
          {rows.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12.5px] text-mist-700">还没有案例</p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className={cn(
                  'mb-1 rounded-lg px-2.5 py-2',
                  editing?.id === row.id ? 'bg-gold/10' : 'hover:bg-ink-850',
                )}
              >
                <p className="truncate text-[13px] text-mist-200">{row.title}</p>
                <p className="text-[11px] text-mist-700">
                  {row.status === 'live' ? '直播中' : row.status === 'upcoming' ? '未开始' : '回放可看'}
                  {row.duration ? ` · ${row.duration}` : ''}
                </p>
                <div className="mt-1.5 flex gap-1.5">
                  <RowActions
                    editing={editing?.id === row.id}
                    onEdit={() => {
                      setEditing(row)
                      setForm({
                        title: row.title,
                        summary: row.summary ?? '',
                        content: row.content ?? '',
                        status: row.status,
                        start_at: row.start_at ? row.start_at.slice(0, 16) : '',
                        duration: row.duration ?? '',
                        replay_url: row.replay_url ?? '',
                        cover_url: row.cover_url ?? '',
                        order_no: String(row.order_no),
                      })
                    }}
                    onDelete={async () => {
                      const ok = await confirm({
                        title: '删除案例',
                        message: `确定删除「${row.title}」？`,
                        confirmText: '确认删除',
                      })
                      if (!ok) return
                      try {
                        await deleteCase(row.id)
                        toast.success('已删除')
                        await load()
                      } catch (err) {
                        toast.error(readableError(err))
                      }
                    }}
                  />
                  {row.cover_url ? (
                    <button
                      type="button"
                      onClick={() => openPreview(row.cover_url ?? '')}
                      className="rounded-md border border-ink-700 px-2 py-1 text-[11.5px] text-mist-500 hover:text-mist-200"
                    >
                      <Eye size={11} className="mr-1 inline" />
                      封面
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-[13.5px] text-mist-100">{editing ? `编辑：${editing.title}` : '新增案例'}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="标题">
            <input
              className="field"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="10.7 案例"
            />
          </Field>
          <Field label="状态">
            <select
              className="field"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as CaseRow['status'] })}
            >
              <option value="upcoming">未开始</option>
              <option value="live">直播中</option>
              <option value="ended">回放可看</option>
            </select>
          </Field>
          <Field label="开播时间">
            <input
              className="field"
              type="datetime-local"
              value={form.start_at}
              onChange={(e) => setForm({ ...form, start_at: e.target.value })}
            />
          </Field>
          <Field label="时长">
            <input
              className="field"
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
              placeholder="1 小时 20 分"
            />
          </Field>
          <Field label="排序号">
            <input
              className="field"
              inputMode="numeric"
              value={form.order_no}
              onChange={(e) => setForm({ ...form, order_no: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label="回放外链" hint="视频体积大，建议用外链">
            <input
              className="field"
              value={form.replay_url}
              onChange={(e) => setForm({ ...form, replay_url: e.target.value })}
              placeholder="https://…"
            />
          </Field>
        </div>
        <div className="mt-3">
          <AssetField
            label="封面"
            value={form.cover_url}
            onChange={(next) => setForm({ ...form, cover_url: next })}
          />
        </div>
        <div className="mt-3">
          <Field label="摘要">
            <input
              className="field"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
          </Field>
        </div>
        <div className="mt-3">
          <MarkdownField
            label="案例正文"
            value={form.content}
            onChange={(next) => setForm({ ...form, content: next })}
          />
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-primary" onClick={submit}>
            <Save size={14} />
            {editing ? '保存修改' : '创建'}
          </button>
          {editing ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setEditing(null)
                setForm(empty)
              }}
            >
              <X size={14} />
              取消编辑
            </button>
          ) : null}
        </div>

        {preview ? (
          <div className="mt-4 rounded-xl border border-ink-700 bg-ink-850 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] text-mist-500">封面预览</span>
              <button type="button" className="text-[12px] text-mist-600" onClick={() => setPreview(null)}>
                关闭
              </button>
            </div>
            <img src={preview} alt="封面预览" className="max-h-56 rounded-lg" />
          </div>
        ) : null}
      </Card>
    </div>
  )
}

/* ---------------- 进阶研报库 ---------------- */

export function MaterialPanel() {
  const toast = useToast()
  const { confirm, dialog } = useConfirm()
  const [rows, setRows] = useState<MaterialRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<MaterialRow | null>(null)
  const empty = {
    title: '',
    mtype: '讲义',
    summary: '',
    content: '',
    file_url: '',
    sort_order: '0',
  }
  const [form, setForm] = useState(empty)

  const load = useCallback(async () => {
    try {
      setRows(await listMaterials())
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async () => {
    if (!form.title.trim()) return toast.error('请填写标题')
    try {
      const payload = {
        title: form.title.trim(),
        mtype: form.mtype.trim() || '讲义',
        summary: form.summary.trim() || null,
        content: form.content.trim() || null,
        file_url: form.file_url.trim() || null,
        sort_order: Number(form.sort_order) || 0,
      }
      if (editing) {
        await adminUpdateMaterial(editing.id, payload)
        toast.success('资料已更新')
      } else {
        await adminSaveMaterial(payload)
        toast.success('资料已上传')
      }
      setEditing(null)
      setForm(empty)
      await load()
    } catch (err) {
      toast.error(readableError(err))
    }
  }

  if (loading) return <div className="skeleton h-64 rounded-2xl" />

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card padded={false}>
        <div className="max-h-[70vh] overflow-y-auto p-2">
          {dialog}
          {rows.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12.5px] text-mist-700">还没有资料</p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className={cn(
                  'mb-1 rounded-lg px-2.5 py-2',
                  editing?.id === row.id ? 'bg-gold/10' : 'hover:bg-ink-850',
                )}
              >
                <p className="truncate text-[13px] text-mist-200">{row.title}</p>
                <p className="text-[11px] text-mist-700">
                  {row.mtype} · {row.file_url ? '有文件' : '仅正文'}
                </p>
                <div className="mt-1.5">
                  <RowActions
                    editing={editing?.id === row.id}
                    onEdit={() => {
                      setEditing(row)
                      setForm({
                        title: row.title,
                        mtype: row.mtype,
                        summary: row.summary ?? '',
                        content: row.content ?? '',
                        file_url: row.file_url ?? '',
                        sort_order: String(row.sort_order),
                      })
                    }}
                    onDelete={async () => {
                      const ok = await confirm({
                        title: '删除资料',
                        message: `确定删除「${row.title}」？`,
                        confirmText: '确认删除',
                      })
                      if (!ok) return
                      try {
                        await adminDeleteMaterial(row.id)
                        toast.success('已删除')
                        await load()
                      } catch (err) {
                        toast.error(readableError(err))
                      }
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <p className="mb-3 flex items-center gap-2 text-[13.5px] text-mist-100">
          <ImagePlus size={15} className="text-purple-200" />
          {editing ? `编辑：${editing.title}` : '上传新资料'}
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="标题">
            <input
              className="field"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="类型">
            <input
              className="field"
              value={form.mtype}
              onChange={(e) => setForm({ ...form, mtype: e.target.value })}
              placeholder="讲义 / 研报 / 模板工具 / 结营材料"
            />
          </Field>
          <Field label="排序号">
            <input
              className="field"
              inputMode="numeric"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
        </div>
        <div className="mt-3">
          <AssetField
            label="资料文件"
            accept="image/*,.pdf,.csv,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.zip,.txt"
            value={form.file_url}
            onChange={(next) => setForm({ ...form, file_url: next })}
            hint="上传后自动存库并生成 asset-id 引用；大文件建议填外链"
          />
        </div>
        <div className="mt-3">
          <Field label="简介">
            <input
              className="field"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
          </Field>
        </div>
        <div className="mt-3">
          <MarkdownField
            label="补充说明"
            value={form.content}
            onChange={(next) => setForm({ ...form, content: next })}
          />
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-primary" onClick={submit}>
            <Plus size={14} />
            {editing ? '保存修改' : '上传'}
          </button>
          {editing ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setEditing(null)
                setForm(empty)
              }}
            >
              <X size={14} />
              取消编辑
            </button>
          ) : null}
        </div>
      </Card>
    </div>
  )
}

export { EmptyState }

/* ---------------- 高级学员课程回放 ---------------- */

export function CourseVideoPanel() {
  const toast = useToast()
  const { confirm, dialog } = useConfirm()
  const [rows, setRows] = useState<CourseVideoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<CourseVideoRow | null>(null)
  const empty = {
    title: '',
    period: '',
    duration: '',
    url: '',
    summary: '',
    sort_order: '0',
    published: true,
  }
  const [form, setForm] = useState(empty)

  const load = useCallback(async () => {
    try {
      setRows(await listCourseVideos(false))
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const reset = () => {
    setEditing(null)
    setForm(empty)
  }

  const submit = async () => {
    if (!form.title.trim()) return toast.error('请填写标题')
    if (!form.url.trim()) return toast.error('请填写视频链接')
    const parsed = parseVideoUrl(form.url)
    try {
      const payload = {
        title: form.title.trim(),
        period: form.period.trim() || null,
        duration: form.duration.trim() || null,
        url: form.url.trim(),
        summary: form.summary.trim() || null,
        sort_order: Number(form.sort_order) || 0,
        published: form.published,
      }
      if (editing) {
        await adminSaveCourseVideo({ id: editing.id, ...payload })
        toast.success('回放已更新')
      } else {
        await adminSaveCourseVideo(payload)
        toast.success(parsed.kind === 'other' ? '回放已添加（该链接将以外链方式打开）' : '回放已添加')
      }
      reset()
      await load()
    } catch (err) {
      toast.error(readableError(err))
    }
  }

  if (loading) return <div className="skeleton h-64 rounded-2xl" />

  const preview = form.url.trim() ? parseVideoUrl(form.url) : null

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card padded={false}>
        <div className="max-h-[70vh] overflow-y-auto p-2">
          {dialog}
          {rows.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12.5px] text-mist-700">还没有回放</p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className={cn(
                  'mb-1 rounded-lg px-2.5 py-2',
                  editing?.id === row.id ? 'bg-gold/10' : 'hover:bg-ink-850',
                )}
              >
                <p className="truncate text-[13px] text-mist-200">{row.title}</p>
                <p className="text-[11px] text-mist-700">
                  {row.period ? `${row.period} · ` : ''}
                  {row.published ? '已发布' : '未发布'}
                  {parseVideoUrl(row.url).kind === 'other' ? ' · 外链' : ''}
                </p>
                <div className="mt-1.5">
                  <RowActions
                    editing={editing?.id === row.id}
                    onEdit={() => {
                      setEditing(row)
                      setForm({
                        title: row.title,
                        period: row.period ?? '',
                        duration: row.duration ?? '',
                        url: row.url,
                        summary: row.summary ?? '',
                        sort_order: String(row.sort_order),
                        published: row.published,
                      })
                    }}
                    onDelete={() => {
                      void (async () => {
                        const ok = await confirm({
                          title: '删除课程回放',
                          message: `确定删除「${row.title}」？`,
                          confirmText: '确认删除',
                        })
                        if (!ok) return
                        try {
                          await adminDeleteCourseVideo(row.id)
                          toast.success('已删除')
                          if (editing?.id === row.id) reset()
                          await load()
                        } catch (err) {
                          toast.error(readableError(err))
                        }
                      })()
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <p className="mb-3 flex items-center gap-2 text-[13.5px] text-mist-100">
          <MonitorPlay size={15} className="text-purple-200" />
          {editing ? `编辑：${editing.title}` : '添加课程回放'}
        </p>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="标题">
            <input
              className="field"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="如：第一次连麦陪跑 · 财报跟踪"
            />
          </Field>
          <Field label="期次" hint="选填，如「第 1 期」">
            <input
              className="field"
              value={form.period}
              onChange={(e) => setForm({ ...form, period: e.target.value })}
            />
          </Field>
          <Field label="时长" hint="选填，如「2 小时」">
            <input
              className="field"
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
            />
          </Field>
        </div>

        <div className="mt-3">
          <Field label="视频链接" hint="B 站链接可直接站内播放；也支持 mp4 等直链">
            <input
              className="field"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://www.bilibili.com/video/BV… 或 https://…/lesson.mp4"
            />
          </Field>
          {preview ? (
            <p className="mt-1.5 text-[11.5px] text-mist-700">
              {preview.kind === 'bilibili'
                ? '✓ 已识别为 B 站视频，学员端将站内嵌入播放'
                : preview.kind === 'direct'
                  ? '✓ 已识别为直链视频，学员端将用站内播放器播放'
                  : '该链接无法站内播放，学员端将显示「在新窗口观看」按钮'}
            </p>
          ) : null}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Field label="简介" hint="选填">
            <input
              className="field"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
          </Field>
          <Field label="排序号" hint="小的在前">
            <input
              className="field"
              inputMode="numeric"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label="状态">
            <label className="flex h-[38px] items-center gap-2 text-[13px] text-mist-300">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => setForm({ ...form, published: e.target.checked })}
              />
              发布给学员
            </label>
          </Field>
        </div>

        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-primary" onClick={() => void submit()}>
            <Save size={14} />
            {editing ? '保存修改' : '添加回放'}
          </button>
          {editing ? (
            <button type="button" className="btn btn-ghost" onClick={reset}>
              <X size={14} />
              取消编辑
            </button>
          ) : null}
        </div>

        <p className="mt-3 rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-[11.5px] leading-relaxed text-mist-600">
          为什么填链接而不是传文件：本站云存储要求云服务登录会话（自建账号体系拿不到），
          云数据库实测上传约 4MB 就需 30 秒、10MB 直接超时，视频文件无法直传。
          建议把录播上传到 B 站（免费、不限时长、支持站内嵌入）或其他支持直链的存储，
          再把链接粘贴到这里，学员端开箱即播。
        </p>
      </Card>
    </div>
  )
}

/* ---------------- 企业研究表 ---------------- */

/**
 * 企业研究表后台。
 *
 * 编辑表单只保留核心字段（行业 / 市值 / PE / 净利润 / 增速 / 备注），
 * 其余历史字段（跟踪、偏好、净资产、β、股息率等）已按需求从编辑功能移除，
 * 数据仍保留在库中（批量导入列也保留，便于从飞书整体重导）。
 */
type CompanyForm = {
  name: string
  macro_industry: string
  industry: string
  ths_industry: string
  updated_date: string
  market_cap: string
  pe_ttm: string
  cap_updated_at: string
  min_pe_10y: string
  current_profit: string
  last_year_profit: string
  profit_growth_5y: string
  dividend_yield: string
  note: string
}

const numOrNull = (s: string) => {
  const t = s.trim()
  if (!t) return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

const strOrNull = (s: string) => s.trim() || null

const BLANKS: Record<keyof CompanyForm, string> = {
  name: '',
  macro_industry: '',
  industry: '',
  ths_industry: '',
  updated_date: '',
  market_cap: '',
  pe_ttm: '',
  cap_updated_at: '',
  min_pe_10y: '',
  current_profit: '',
  last_year_profit: '',
  profit_growth_5y: '',
  dividend_yield: '',
  note: '',
}

const COMPANY_EMPTY: CompanyForm = { ...BLANKS }

/** 文本类字段 */
const STR_KEYS: Array<keyof CompanyForm> = [
  'macro_industry',
  'industry',
  'ths_industry',
  'updated_date',
  'cap_updated_at',
  'note',
]

/** 数值类字段（直接入库） */
const NUM_KEYS: Array<keyof CompanyForm> = [
  'market_cap',
  'pe_ttm',
  'min_pe_10y',
  'current_profit',
  'last_year_profit',
  'profit_growth_5y',
  'dividend_yield',
]

/** 批量导入列定义（保留历史字段列，便于从飞书整体重导） */
const IMPORT_COLUMNS: Array<[keyof CompanyForm | 'preference' | 'selected_at' | 'net_asset' | 'beta' | 'payout_ratio' | 'retention_ratio' | 'buyback_ratio' | 'ev' | 'gdp_growth' | 'risk_free_rate', string]> = [
  ['name', '企业名'],
  ['macro_industry', '宏观行业'],
  ['industry', '细分行业'],
  ['ths_industry', '同花顺行业路径'],
  ['preference', '投资偏好'],
  ['selected_at', '入选日期'],
  ['updated_date', '数据更新时间'],
  ['market_cap', '当日市值(亿)'],
  ['pe_ttm', '当日市盈率(TTM)'],
  ['min_pe_10y', '十年最低PE-TTM'],
  ['current_profit', '当期净利润(亿)'],
  ['last_year_profit', '上年净利润(亿)'],
  ['profit_growth_5y', '近五年平均增速(%)'],
  ['dividend_yield', '当前股息率(%)'],
  ['net_asset', '净资产(亿)'],
  ['beta', 'β系数'],
  ['payout_ratio', '股息支付率(%)'],
  ['retention_ratio', '留存比率(%)'],
  ['buyback_ratio', '派现回购率(%)'],
  ['ev', '内含价值EV'],
  ['gdp_growth', 'GDP增速(%)'],
  ['risk_free_rate', '无风险利率(%)'],
  ['note', '备注'],
]

const IMPORT_RATIO_KEYS = new Set(['payout_ratio', 'retention_ratio', 'buyback_ratio', 'gdp_growth', 'risk_free_rate'])
const IMPORT_STR_KEYS = new Set([
  'name', 'macro_industry', 'industry', 'ths_industry', 'preference',
  'selected_at', 'updated_date', 'cap_updated_at', 'note',
])

function parseCompanyImport(text: string) {
  const items: Array<Partial<CompanyResearchRow>> = []
  const bad: string[] = []
  const lines = text.split(/\r?\n/)
  lines.forEach((raw, idx) => {
    const line = raw.trim()
    if (!line) return
    const cells = line.split(/[\t,，;；]+/).map((c) => c.trim())
    // 跳过表头行
    if (idx === 0 && /企业名|公司|行业|名称/.test(cells[0]) && !/\d/.test(cells[0])) return
    if (!cells[0]) {
      bad.push(`第 ${idx + 1} 行：缺少企业名`)
      return
    }
    const row: Record<string, unknown> = {}
    IMPORT_COLUMNS.forEach(([key], i) => {
      const v = cells[i] ?? ''
      if (!v) return
      if (IMPORT_RATIO_KEYS.has(key)) {
        const n = numOrNull(v.replace(/%$/, ''))
        row[key] = n === null ? null : n / 100
      } else if (IMPORT_STR_KEYS.has(key)) row[key] = v
      else row[key] = numOrNull(v.replace(/%$/, ''))
    })
    items.push(row as Partial<CompanyResearchRow>)
  })
  return { items, bad }
}

export function CompanyResearchPanel() {
  const toast = useToast()
  const { confirm, dialog } = useConfirm()
  const [rows, setRows] = useState<CompanyResearchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<CompanyResearchRow | null>(null)
  const [form, setForm] = useState<CompanyForm>(COMPANY_EMPTY)
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    try {
      setRows(await listCompanyResearch())
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const reset = () => {
    setEditing(null)
    setForm(COMPANY_EMPTY)
    setFormOpen(false)
  }

  const openNew = () => {
    setEditing(null)
    setForm(COMPANY_EMPTY)
    setFormOpen(true)
  }

  const submit = async () => {
    if (!form.name.trim()) return toast.error('请填写企业名')
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { name: form.name.trim() }
      for (const k of STR_KEYS) payload[k] = strOrNull(form[k])
      for (const k of NUM_KEYS) payload[k] = numOrNull(form[k])
      // 新增企业：自动排到列表末尾（排序字段已从编辑功能移除）
      if (!editing) payload.sort_order = rows.length
      await adminSaveCompanyResearch({
        id: editing?.id,
        ...payload,
      } as Partial<CompanyResearchRow> & { name: string })
      toast.success(editing ? '企业已更新' : '企业已添加')
      reset()
      await load()
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setSaving(false)
    }
  }

  const doImport = async () => {
    const { items, bad } = parseCompanyImport(importText)
    if (!items.length) return toast.error('没有解析到有效数据，请检查格式')
    setImporting(true)
    try {
      const base = rows.length
      const n = await adminImportCompanyResearch(
        items.map((it, i) => ({ ...it, sort_order: base + i })) as Array<Partial<CompanyResearchRow>>,
      )
      toast.success(`已导入 ${n} 家企业${bad.length ? `，${bad.length} 行无效已跳过` : ''}`)
      setImportText('')
      setImportOpen(false)
      await load()
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setImporting(false)
    }
  }

  const clearAll = () => {
    void (async () => {
      const ok = await confirm({
        title: '清空企业研究表',
        message: `将删除全部 ${rows.length} 家企业数据（通常用于重新导入），确定继续？`,
        confirmText: '清空并重来',
      })
      if (!ok) return
      try {
        await adminClearCompanyResearch()
        toast.success('已清空')
        reset()
        await load()
      } catch (err) {
        toast.error(readableError(err))
      }
    })()
  }

  if (loading) return <div className="skeleton h-64 rounded-2xl" />

  const preview = importText.trim() ? parseCompanyImport(importText) : null
  const capDate = rows.find((r) => r.cap_updated_at)?.cap_updated_at ?? null

  const numFields: Array<[keyof CompanyForm, string, string?]> = [
    ['market_cap', '当日市值（亿）', capDate ? `最新 ${capDate}` : undefined],
    ['pe_ttm', '当日市盈率（TTM）', '每交易日收盘后自动更新'],
    ['min_pe_10y', '十年期最低 PE-TTM'],
    ['current_profit', '当期净利润（亿）', '最新报告期，本期为 2026 中报'],
    ['last_year_profit', '上年净利润（亿）', '2025 年报归母净利润'],
    ['profit_growth_5y', '近五年归母净利润平均增速（%）'],
    ['dividend_yield', '当前股息率（%）', '近 12 个月'],
  ]

  return (
    <div className="space-y-4">
      {dialog}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13.5px] text-mist-100">企业研究表数据管理</p>
            <p className="mt-0.5 text-[11.5px] text-mist-700">
              共 {rows.length} 家企业 · 当日市值每交易日收盘后自动更新
              {capDate ? `（最新 ${capDate}）` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {rows.length ? (
              <button type="button" className="btn btn-ghost" onClick={clearAll}>
                <Trash2 size={14} />
                清空
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost" onClick={() => setImportOpen(true)}>
              <Upload size={14} />
              批量导入
            </button>
            <button type="button" className="btn btn-primary" onClick={openNew}>
              <Plus size={14} />
              新增企业
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          {rows.length === 0 ? (
            <p className="px-2 py-8 text-center text-[12.5px] text-mist-700">
              还没有企业数据，点击「新增企业」或「批量导入」开始。
            </p>
          ) : (
            <table className="w-full min-w-[880px] text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-700 text-left text-mist-700">
                  <th className="px-3 py-2.5 font-medium">企业</th>
                  <th className="px-3 py-2.5 font-medium">行业（宏观 - 细分 - 三级）</th>
                  <th className="px-3 py-2.5 text-right font-medium">当日市值（亿）</th>
                  <th className="px-3 py-2.5 text-right font-medium">当日市盈率</th>
                  <th className="px-3 py-2.5 text-right font-medium">十年最低PE</th>
                  <th className="px-3 py-2.5 text-right font-medium">当期净利润</th>
                  <th className="px-3 py-2.5 text-right font-medium">上年净利润</th>
                  <th className="px-3 py-2.5 text-right font-medium">近五年平均增速</th>
                  <th className="px-3 py-2.5 text-right font-medium">当前股息率</th>
                  <th className="px-3 py-2.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-ink-800/60 last:border-0">
                    <td className="px-3 py-2.5 text-mist-100">
                      {row.name}
                      <span className="ml-2 text-[11px] text-mist-700">{row.updated_date ?? ''}</span>
                    </td>
                    <td className="px-3 py-2.5 text-mist-300">
                      {(row.ths_industry || [row.macro_industry, row.industry].filter(Boolean).join('--'))
                        .split('--')
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .join(' - ') || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-mist-300">
                      {row.market_cap ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-mist-300">
                      {row.pe_ttm ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-mist-300">
                      {row.min_pe_10y ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-mist-300">
                      {row.current_profit ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-mist-300">
                      {row.last_year_profit ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-mist-300">
                      {row.profit_growth_5y === null
                        ? '—'
                        : `${row.profit_growth_5y > 0 ? '+' : ''}${row.profit_growth_5y}%`}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-mist-300">
                      {row.dividend_yield === null ? '—' : `${row.dividend_yield}%`}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <RowActions
                        editing={editing?.id === row.id}
                        onEdit={() => {
                          setEditing(row)
                          const next: Record<string, string> = { ...COMPANY_EMPTY }
                          for (const k of Object.keys(BLANKS) as Array<keyof CompanyForm>) {
                            const v = row[k as keyof CompanyResearchRow]
                            if (typeof v === 'number') next[k] = String(v)
                            else if (typeof v === 'string') next[k] = v
                            else next[k] = ''
                          }
                          setForm(next as CompanyForm)
                          setFormOpen(true)
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                        onDelete={() => {
                          void (async () => {
                            const ok = await confirm({
                              title: '删除企业',
                              message: `确定从企业研究表中删除「${row.name}」？`,
                              confirmText: '确认删除',
                            })
                            if (!ok) return
                            try {
                              await adminDeleteCompanyResearch(row.id)
                              toast.success('已删除')
                              if (editing?.id === row.id) reset()
                              await load()
                            } catch (err) {
                              toast.error(readableError(err))
                            }
                          })()
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* 新增 / 编辑弹窗 */}
      <Modal
        open={formOpen}
        onClose={() => reset()}
        title={editing ? `编辑：${editing.name}` : '新增企业'}
        subtitle="字段留空则学员端显示「—」"
        width="max-w-2xl"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => reset()} disabled={saving}>
              取消
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={saving}>
              {saving ? <Spinner size={14} /> : <Save size={14} />}
              保存
            </button>
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="企业名">
            <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="宏观行业" hint="同花顺一级，如 电子">
            <input
              className="field"
              value={form.macro_industry}
              onChange={(e) => setForm({ ...form, macro_industry: e.target.value })}
            />
          </Field>
          <Field label="细分行业" hint="同花顺二级，如 半导体">
            <input
              className="field"
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="同花顺行业完整路径" hint="一级--二级--三级，前台按此显示为「宏观 - 细分 - 三级」">
              <input
                className="field"
                value={form.ths_industry}
                onChange={(e) => setForm({ ...form, ths_industry: e.target.value })}
              />
            </Field>
          </div>
          {numFields.map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint}>
              <input className="field" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
            </Field>
          ))}
          <Field label="市值更新时间" hint="自动更新时写入">
            <input
              className="field"
              value={form.cap_updated_at}
              onChange={(e) => setForm({ ...form, cap_updated_at: e.target.value })}
            />
          </Field>
        </div>
        <Field label="备注">
          <textarea className="field min-h-[72px]" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
      </Modal>

      {/* 批量导入弹窗 */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="批量导入企业数据"
        subtitle="每行一家企业，支持逗号 / Tab / 中文逗号分隔"
        width="max-w-3xl"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setImportOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void doImport()}
              disabled={importing || !preview || preview.items.length === 0}
            >
              {importing ? <Spinner size={14} /> : <Upload size={14} />}
              {preview ? `导入 ${preview.items.length} 家` : '导入'}
            </button>
          </>
        }
      >
        <p className="mb-2 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-[11.5px] leading-relaxed text-mist-500">
          列顺序（可留空，但逗号占位要保留）：
          <br />
          <span className="text-mist-300">{IMPORT_COLUMNS.map(([, n]) => n).join('、')}</span>
          <br />
          「数据更新时间」无需填写，系统会自动记为导入当天。
          <br />
          示例：
          <span className="text-mist-300">贵州茅台, 食品饮料, 白酒, 食品饮料--白酒--白酒Ⅲ, 价值投资、股息, 2026-07-25, 2026-10-11, 16219, 15.36, 445.17, 823.2, 12.38</span>
        </p>
        <textarea
          className="field min-h-[180px] font-mono text-[12px]"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={'贵州茅台, 食品饮料, 白酒, 食品饮料--白酒--白酒Ⅲ, 价值投资、股息, 2026-07-25, 2026-10-11, 16219, 15.36, 445.17, 823.2, 12.38\n宁德时代, 电力设备, 电池, 电力设备--电池--锂电池, 价值投资、业绩, 2026-07-25, 2026-10-11, 17049, 13.98, 432.84, 722.01, 75.82'}
        />
        {preview ? (
          <p className="mt-2 text-[12px] text-mist-500">
            已识别 <b className="text-gold-soft">{preview.items.length}</b> 家企业
            {preview.bad.length ? (
              <span className="text-up">，{preview.bad.length} 行无法解析（{preview.bad[0]}…）</span>
            ) : null}
          </p>
        ) : null}
      </Modal>
    </div>
  )
}
