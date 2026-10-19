/**
 * ── 文件：src/pages/HomeworkPage.tsx ────────────────────────────
 * 功能：高级学员作业：作业列表、我的提交、提交表单与批改结果。
 * 数据：listHomework、listMySubmits、submitHomework。
 * 改动指引：
 *   1. 改提交校验（字数 / 截止时间）→ 表单提交前的校验；
 *   2. 改展示字段 → SubmitRow 渲染区；
 *   3. 作业与批改维护 → 后台 AdminPage 的作业管理。
 */

import { useCallback, useEffect, useState } from 'react'
import { Card, PageHeader, PendingContent } from '../components/PageHeader'
import { EmptyState, Field, Spinner } from '../components/ui'
import { cn, formatDate, readableError } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  listHomework,
  listMySubmits,
  submitHomework,
  type HomeworkRow,
  type SubmitRow,
} from '../services/content'

/** 高级学员作业：列表、提交、批改结果。 */
export function HomeworkPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState<HomeworkRow[]>([])
  const [submits, setSubmits] = useState<SubmitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!user?.id) return
    try {
      const [list, mine] = await Promise.all([listHomework(), listMySubmits(user.id)])
      setRows(list)
      setSubmits(mine)
      if (list.length) setActiveId((prev) => prev ?? list[0].id)
    } catch (err) {
      setError(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void load()
  }, [load])

  const active = rows.find((r) => r.id === activeId) ?? null
  const existing = active ? submits.find((s) => s.homework_id === active.id) ?? null : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!active || !user) return
    if (!draft.trim()) return toast.error('请填写作业内容')
    setBusy(true)
    try {
      await submitHomework({
        homework_id: active.id,
        user_id: user.id,
        user_name: user.nickname || user.displayName,
        content: draft.trim(),
      })
      setDraft('')
      toast.success('作业已提交')
      await load()
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Homework"
        title="高级学员作业"
        desc="每次课后作业由讲师发布，学员在此提交；结营材料也在此提交。"
        right={
          user?.masterPeriod ? (
            <span className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-[12px] text-purple-200">
              {user.masterPeriod}
            </span>
          ) : null
        }
      />

      {loading ? (
        <div className="grid gap-3 md:grid-cols-[320px_1fr]">
          <div className="skeleton h-64 rounded-2xl" />
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      ) : error ? (
        <EmptyState title="加载失败" desc={error} />
      ) : rows.length === 0 ? (
        <PendingContent hint="讲师发布作业后会出现在这里，提交入口同步开放。" />
      ) : (
        <div className="grid gap-4 md:grid-cols-[320px_1fr]">
          <Card padded={false} className="overflow-hidden">
            <nav className="p-2">
              {rows.map((row) => {
                const done = submits.some((s) => s.homework_id === row.id)
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      setActiveId(row.id)
                      setDraft('')
                    }}
                    className={cn(
                      'mb-0.5 block w-full rounded-lg px-3 py-2.5 text-left transition',
                      activeId === row.id ? 'bg-purple-500/15' : 'hover:bg-ink-850',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          'text-[12.5px]',
                          activeId === row.id ? 'text-purple-100' : 'text-mist-300',
                        )}
                      >
                        {row.title}
                      </span>
                      {done ? <span className="ml-auto text-[10.5px] text-emerald-300">已提交</span> : null}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-mist-700">
                      {row.period}
                      {row.deadline ? ` · 截止 ${formatDate(row.deadline)}` : ''}
                    </span>
                  </button>
                )
              })}
            </nav>
          </Card>

          <Card>
            {active ? (
              <>
                <p className="text-[11.5px] text-mist-700">
                  {active.period} · 发布于 {formatDate(active.published_at)}
                  {active.deadline ? ` · 截止 ${formatDate(active.deadline)}` : ''}
                </p>
                <h2 className="serif mt-1 text-[19px] text-mist-100">{active.title}</h2>
                {active.content.trim() ? (
                  <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-mist-400">
                    {active.content}
                  </p>
                ) : (
                  <p className="mt-3 text-[12.5px] text-mist-700">作业说明待讲师补充。</p>
                )}

                <hr className="my-4 border-ink-700" />

                {existing ? (
                  <div>
                    <p className="mb-2 text-[12.5px] text-emerald-300">
                      已于 {formatDate(existing.submitted_at)} 提交
                    </p>
                    <p className="whitespace-pre-wrap rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-[13px] leading-relaxed text-mist-300">
                      {existing.content}
                    </p>
                    {existing.score !== null ? (
                      <p className="mt-2 text-[12.5px] text-gold-soft">讲师评分：{existing.score}</p>
                    ) : null}
                    {existing.review ? (
                      <p className="mt-2 whitespace-pre-wrap rounded-xl border border-purple-500/25 bg-purple-500/[0.06] px-3.5 py-3 text-[13px] leading-relaxed text-mist-300">
                        {existing.review}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <form onSubmit={submit}>
                    <Field label="作业内容">
                      <textarea
                        className="field min-h-[160px] resize-y"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="把你的研究过程与结论写清楚…"
                      />
                    </Field>
                    <button type="submit" className="btn btn-primary mt-3" disabled={busy}>
                      {busy ? <Spinner size={14} /> : null}提交作业
                    </button>
                  </form>
                )}
              </>
            ) : (
              <PendingContent />
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
