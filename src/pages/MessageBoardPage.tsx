/**
 * ── 文件：src/pages/MessageBoardPage.tsx ────────────────────────
 * 功能：学员留言板：发布留言（上限 500 字）、列表、管理员回复与置顶展示。
 * 数据：listMessages、createMessage。
 * 改动指引：
 *   1. 改字数上限 → MAX_LEN；
 *   2. 改排序 / 分页 → listMessages 的入参；
 *   3. 回复与置顶 → 后台 AdminPage 的留言回复面板。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Lock, MessageCircle, Send } from 'lucide-react'
import { Card, PageHeader } from '../components/PageHeader'
import { EmptyState, Field, Spinner } from '../components/ui'
import { cn, readableError, relativeTime } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { createMessage, listMessages, type MessageRow } from '../services/content'

const MAX_LEN = 500

/** 学员留言板：发布 + 列表 + 管理员回复展示。 */
export function MessageBoardPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState<MessageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mineOnly, setMineOnly] = useState(false)

  const [content, setContent] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [isPrivate, setIsPrivate] = useState(true)
  const [busy, setBusy] = useState(false)

  const userId = user?.id ?? ''
  const isAdmin = Boolean(user?.isAdmin)
  const token = user?.token ?? null

  const load = useCallback(async () => {
    if (!userId) return
    try {
      // 留言读取走服务端函数：管理员拿全量，普通用户只拿「自己的 + 非私密的」
      setRows(await listMessages({ uid: userId, token }, { mineOnly }))
    } catch (err) {
      setError(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [userId, token, mineOnly])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  const summary = useMemo(() => {
    const answered = rows.filter((r) => r.reply).length
    return { total: rows.length, answered }
  }, [rows])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = content.trim()
    if (!text) return toast.error('请填写留言内容')
    setBusy(true)
    try {
      await createMessage({
        user_id: userId,
        author_name: anonymous ? '匿名学员' : (user?.nickname || user?.displayName || '学员'),
        content: text,
        is_anonymous: anonymous,
        is_private: isPrivate,
      })
      setContent('')
      toast.success(isPrivate ? '已提交，仅老师可见' : '已提交')
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
        eyebrow="Message Board"
        title="学员留言板"
        desc="疑问在这里提交，由管理员亲自回复。默认私密（仅老师可见）。"
        right={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMineOnly(false)}
              className={cn('btn btn-ghost', !mineOnly && 'border-gold/40 text-gold-soft')}
            >
              全部
            </button>
            <button
              type="button"
              onClick={() => setMineOnly(true)}
              className={cn('btn btn-ghost', mineOnly && 'border-gold/40 text-gold-soft')}
            >
              只看我的
            </button>
          </div>
        }
      />

      <Card>
        <form onSubmit={submit}>
          <Field label="你的疑问" hint={`${content.length} / ${MAX_LEN}`}>
            <textarea
              className="field min-h-[96px] resize-y"
              maxLength={MAX_LEN}
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, MAX_LEN))}
              placeholder="把你的疑问写清楚，方便管理员精准回复…"
            />
          </Field>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[12.5px]">
            <label className="flex items-center gap-1.5 text-mist-400">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                className="accent-[#d8ab4a]"
              />
              匿名留言
            </label>
            <label className="flex items-center gap-1.5 text-mist-400">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="accent-[#d8ab4a]"
              />
              私密（仅老师可见）
            </label>
            <span className="ml-auto text-[11.5px] text-mist-700">字数上限 500 字</span>
          </div>
          <button type="submit" className="btn btn-primary mt-4" disabled={busy}>
            {busy ? <Spinner size={14} /> : <Send size={14} />}
            提交疑问
          </button>
        </form>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState title="加载失败" desc={error} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<MessageCircle size={19} />} title="还没有留言" desc="提出第一个问题吧。" />
      ) : (
        <div className="space-y-3">
          <p className="text-[11.5px] text-mist-700">
            共 {summary.total} 条留言，其中 {summary.answered} 条已有回复 · 由新到老展示
          </p>
          {rows.map((row) => (
            <Card key={row.id}>
              <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-mist-700">
                <span className="text-mist-400">
                  {row.is_anonymous ? '匿名学员' : row.author_name}
                  {row.user_id === userId ? '（我）' : ''}
                </span>
                {row.pinned ? <span className="text-gold-soft">已置顶</span> : null}
                {row.is_private ? (
                  <span className="flex items-center gap-1">
                    <Lock size={11} />
                    私密
                  </span>
                ) : null}
                <span>{relativeTime(row.created_at)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-mist-200">
                {row.content}
              </p>
              {row.reply ? (
                <div className="mt-3 rounded-xl border border-gold/25 bg-gold/[0.06] px-3.5 py-2.5">
                  <p className="text-[11.5px] text-gold-soft">管理员回复</p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-mist-200">
                    {row.reply}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-[11.5px] text-mist-700">等待管理员回复…</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
