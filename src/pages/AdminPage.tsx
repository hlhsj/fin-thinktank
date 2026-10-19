import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Building2,
  Check,
  ClipboardList,
  Database,
  FileText,
  Film,
  Library,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react'
import { Card, PageHeader } from '../components/PageHeader'
import {
  CasePanel,
  CompanyResearchPanel,
  CourseVideoPanel,
  DocPanel,
  MaterialPanel,
  ReviewPanel,
} from '../components/AdminContent'
import { EmptyState, Field, Spinner, useConfirm } from '../components/ui'
import { cn, formatDate, formatDateTime, readableError, relativeTime } from '../lib/utils'
import { SITE } from '../lib/site'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  adminListPasswordResets,
  adminResolvePasswordReset,
  type AdminUserRow,
  type PasswordResetRow,
} from '../services/auth'
import {
  adminDeleteMessage,
  adminSaveMaterial,
  adminSetPrice,
  adminUpdateMessage,
  createPhoneChange,
  confirmOrderAdmin,
  deleteHomeworkAdmin,
  gradeSubmitAdmin,
  listHomework,
  listMessages,
  listOrdersAdmin,
  listPeIndex,
  readPrices,
  listPeIndustry,
  listPhoneChanges,
  listSubmits,
  saveHomeworkAdmin,
  updateOrderAdmin,
  updatePeIndustry,
  updatePhoneChange,
  upsertPeIndex,
  type HomeworkRow,
  type MessageRow,
  type OrderRow,
  type SessionAuth,
  type SubmitRow,
  type PeIndexRow,
  type PeIndustryRow,
  type PhoneChangeRow,
} from '../services/content'

type Tab = 'doc' | 'review' | 'case' | 'material' | 'video' | 'research' | 'users' | 'messages' | 'pe' | 'phone' | 'orders' | 'homework'

const TABS: Array<{ key: Tab; label: string; icon: typeof Users }> = [
  { key: 'doc', label: '学习资料库', icon: BookOpen },
  { key: 'review', label: '复盘文档库', icon: FileText },
  { key: 'case', label: '经典案例分析', icon: Video },
  { key: 'material', label: '进阶研报库', icon: Library },
  { key: 'video', label: '课程回放', icon: Film },
  { key: 'research', label: '企业研究表', icon: Building2 },
  { key: 'users', label: '用户与权益', icon: Users },
  { key: 'messages', label: '留言回复', icon: MessageSquare },
  { key: 'pe', label: '市盈率数据', icon: Database },
  { key: 'homework', label: '作业管理', icon: ClipboardList },
]

export function AdminPage() {
  const auth = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('doc')

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations Console"
        title="运营后台"
        desc="内容发布（学习资料库 / 复盘 / 案例 / 进阶研报 / 课程回放）、权益管理、留言回复、换绑审核与订单确认。"
      />

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition',
              tab === t.key ? 'bg-gold/12 text-gold-soft' : 'text-mist-500 hover:bg-ink-850',
            )}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'doc' ? <DocPanel /> : null}
      {tab === 'review' ? <ReviewPanel /> : null}
      {tab === 'case' ? <CasePanel /> : null}
      {tab === 'material' ? <MaterialPanel /> : null}
      {tab === 'video' ? <CourseVideoPanel /> : null}
      {tab === 'research' ? <CompanyResearchPanel /> : null}
      {tab === 'users' ? <UsersPanel /> : null}
      {tab === 'messages' ? <MessagesPanel /> : null}
      {tab === 'pe' ? <PePanel /> : null}
      {tab === 'homework' ? <HomeworkPanel /> : null}
    </div>
  )
}

/* ---------------- 用户与权益 ---------------- */

/**
 * 「用户与权益」内部分区。
 *
 * 换绑审核与订单确认原先各占一个顶层 Tab，但它们本质都是「围绕某个用户的处理动作」，
 * 管理员核对订单后往往要接着发权益、处理换绑 —— 合并到同一面板内用分区切换，少跳几次。
 */
type UsersSubKey = 'entitlement' | 'price' | 'orders' | 'phone' | 'password'

const USERS_SUBS: Array<{ key: UsersSubKey; label: string }> = [
  { key: 'entitlement', label: '账号权益' },
  { key: 'price', label: '价格设置' },
  { key: 'orders', label: '订单确认' },
  { key: 'phone', label: '换绑审核' },
  { key: 'password', label: '密码重置' },
]

function UsersPanel() {
  const auth = useAuth()
  const toast = useToast()
  const { confirm, dialog } = useConfirm()
  const [sub, setSub] = useState<UsersSubKey>('entitlement')
  const selfUid = auth.user?.id ?? ''
  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyUid, setBusyUid] = useState<string | null>(null)

  const [phone, setPhone] = useState('')
  const [memberDays, setMemberDays] = useState('30')
  const [masterDays, setMasterDays] = useState('0')

  const load = useCallback(async () => {
    try {
      setRows(await auth.adminUsers())
    } catch (err) {
      setError(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [auth])

  useEffect(() => {
    void load()
  }, [load])

  /** 取消该用户的全部权益（学员 + 高级学员），需二次确认 */
  const revoke = async (row: AdminUserRow) => {
    const parts: string[] = []
    if (row.memberExpireAt) parts.push(`学员权益（至 ${row.memberExpireAt}）`)
    if (row.masterExpireAt) parts.push(`高级学员权益（至 ${row.masterExpireAt}）`)
    const ok = await confirm({
      title: '取消用户权益',
      message: `确定取消「${row.nickname || row.phone}」的${parts.join(' 与 ')}？取消后该用户立即失去对应内容的访问权限（付费内容、市场数据明细等），此操作不可撤销。`,
      confirmText: '确认取消权益',
      danger: true,
    })
    if (!ok) return
    setBusyUid(row.uid)
    try {
      await auth.revokeEntitlement(row.uid, 'all')
      toast.success(`已取消 ${row.nickname || row.phone} 的全部权益`)
      await load()
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setBusyUid(null)
    }
  }

  const offset = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
  }

  const grant = async () => {
    if (!/^\d{11}$/.test(phone.replace(/\D/g, ''))) return toast.error('请填写 11 位手机号')
    setBusyUid('grant')
    try {
      await auth.grantEntitlement(
        phone.trim(),
        Number(memberDays) > 0 ? offset(Number(memberDays)) : null,
        Number(masterDays) > 0 ? offset(Number(masterDays)) : null,
      )
      toast.success('权益已发放')
      setPhone('')
      await load()
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setBusyUid(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {USERS_SUBS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSub(s.key)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-[12.5px] transition',
              sub === s.key
                ? 'border-gold/45 bg-gold/12 text-gold-soft'
                : 'border-ink-700 text-mist-500 hover:border-ink-600 hover:text-mist-200',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {sub === 'entitlement' ? (
        <>
      <Card>
        <p className="mb-3 text-[13.5px] text-mist-100">按手机号开通 / 顺延权益</p>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="手机号">
            <input
              className="field"
              inputMode="numeric"
              maxLength={11}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="学员手机号"
            />
          </Field>
          <Field label="学员天数">
            <input
              className="field"
              inputMode="numeric"
              value={memberDays}
              onChange={(e) => setMemberDays(e.target.value.replace(/\D/g, ''))}
              placeholder="30"
            />
          </Field>
          <Field label="高级学员天数">
            <input
              className="field"
              inputMode="numeric"
              value={masterDays}
              onChange={(e) => setMasterDays(e.target.value.replace(/\D/g, ''))}
              placeholder="0 表示不开通"
            />
          </Field>
          <div className="flex items-end">
            <button type="button" className="btn btn-primary w-full" onClick={grant} disabled={busyUid === 'grant'}>
              {busyUid === 'grant' ? <Spinner size={14} /> : <Check size={14} />}
              发放权益
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11.5px] text-mist-700">
          天数从今天起算；若该账号原有权益尚未到期，请在续费页按顺延规则处理。填 0 表示不改变该权益。
        </p>
      </Card>

      {loading ? (
        <div className="skeleton h-52 rounded-2xl" />
      ) : error ? (
        <EmptyState title="加载失败" desc={error} />
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-700 text-left text-mist-700">
                  <th className="px-4 py-3 font-medium">手机号</th>
                  <th className="px-3 py-3 font-medium">昵称</th>
                  <th className="px-3 py-3 font-medium">学员到期</th>
                  <th className="px-3 py-3 font-medium">高级学员到期</th>
                  <th className="px-3 py-3 font-medium">注册 / 最近登录</th>
                  <th className="px-3 py-3 font-medium">管理员</th>
                  <th className="px-3 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.uid} className="border-b border-ink-800/70">
                    <td className="px-4 py-2.5 text-mist-200">{row.phone}</td>
                    <td className="px-3 py-2.5 text-mist-400">{row.nickname || '—'}</td>
                    <td className="px-3 py-2.5 text-mist-300">{row.memberExpireAt ?? '未开通'}</td>
                    <td className="px-3 py-2.5 text-mist-300">{row.masterExpireAt ?? '未开通'}</td>
                    <td className="px-3 py-2.5 text-mist-600">
                      {formatDate(row.createdAt)} / {row.lastLoginAt ? relativeTime(row.lastLoginAt) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        // 不允许取消自己的管理员身份：一旦把自己降权，后台就再也进不来了
                        disabled={busyUid === row.uid || row.uid === selfUid}
                        title={row.uid === selfUid ? '不能取消自己的管理员身份' : '切换管理员身份'}
                        onClick={async () => {
                          setBusyUid(row.uid)
                          try {
                            await auth.toggleAdmin(row.uid, !row.isAdmin)
                            toast.success(row.isAdmin ? '已取消管理员' : '已设为管理员')
                            await load()
                          } catch (err) {
                            toast.error(readableError(err))
                          } finally {
                            setBusyUid(null)
                          }
                        }}
                        className={cn(
                          'rounded-md border px-2 py-0.5 text-[11.5px] transition',
                          row.isAdmin
                            ? 'border-gold/40 bg-gold/10 text-gold-soft'
                            : 'border-ink-700 text-mist-600 hover:text-mist-300',
                          row.uid === selfUid && 'cursor-not-allowed opacity-90',
                        )}
                      >
                        {row.isAdmin ? '是' : '否'}
                        {row.uid === selfUid ? '（本人）' : ''}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      {(() => {
                        const hasEntitlement = Boolean(row.memberExpireAt || row.masterExpireAt)
                        return (
                          <button
                            type="button"
                            disabled={busyUid === row.uid || !hasEntitlement}
                            title={hasEntitlement ? '取消该用户的学员与高级学员权益' : '该用户当前没有可取消的权益'}
                            onClick={() => void revoke(row)}
                            className={cn(
                              'rounded-md border px-2 py-0.5 text-[11.5px] transition',
                              hasEntitlement
                                ? 'border-down/45 text-down hover:bg-down/10'
                                : 'border-ink-700 text-mist-700 opacity-45',
                            )}
                          >
                            {busyUid === row.uid ? '处理中…' : '取消权益'}
                          </button>
                        )
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
        </>
      ) : null}

      {sub === 'price' ? <PricePanel /> : null}
      {sub === 'orders' ? <OrdersPanel onDone={() => void auth.refresh()} /> : null}
      {sub === 'phone' ? <PhonePanel /> : null}
      {sub === 'password' ? <PasswordResetPanel /> : null}
      {dialog}
    </div>
  )
}

/* ---------------- 价格设置（用户与权益 → 价格设置） ---------------- */

/**
 * 套餐价格管理。
 *
 * 价格统一由服务端 `plan_config` 表提供：保存后**支付页展示与下单金额立即同步变化**，
 * 不必再改代码重新发布（此前单价同时硬编码在前端 site.ts 与下单函数里）。
 * 已生成的订单保存的是当时金额，不受调价影响。
 */
function PricePanel() {
  const auth = useAuth()
  const toast = useToast()
  const authPair = useMemo<SessionAuth>(
    () => ({ uid: auth.user?.id ?? '', token: auth.user?.token ?? null }),
    [auth.user],
  )
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [draft, setDraft] = useState<Record<string, string>>({ member: '', master: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const p = await readPrices()
      setPrices(p)
      setDraft({ member: String(p.member ?? ''), master: String(p.master ?? '') })
    } catch (err) {
      setError(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (key: 'member' | 'master') => {
    const val = Number(draft[key])
    if (!Number.isFinite(val) || val <= 0) {
      toast.error('请输入大于 0 的价格')
      return
    }
    setBusy(key)
    try {
      await adminSetPrice(authPair, key, val)
      const name = key === 'master' ? '高级学员权益' : '学员权益'
      toast.success(`${name}价格已更新为 ¥${val}`)
      await load()
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <div className="skeleton h-32 rounded-2xl" />
  if (error) return <EmptyState title="加载失败" desc={error} />

  const rowsMeta: Array<{ key: 'member' | 'master'; name: string; unit: string }> = [
    { key: 'member', name: '学员权益', unit: '月' },
    { key: 'master', name: '高级学员权益', unit: '季度' },
  ]

  return (
    <Card>
      <p className="text-[13.5px] text-mist-100">套餐价格</p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-mist-700">
        保存后，支付页的展示价格与下单金额会立即按新价计算（服务端定价，无需改代码）。
        已产生的历史订单金额不受影响。
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {rowsMeta.map((m) => (
          <div key={m.key} className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-3">
            <p className="text-[12.5px] text-mist-300">
              {m.name}
              <span className="ml-1.5 text-[11.5px] text-mist-700">
                现价 ¥{prices[m.key] ?? '—'} / {m.unit}
              </span>
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Field label={`新价格（元 / ${m.unit}）`}>
                <input
                  className="field w-32"
                  inputMode="numeric"
                  value={draft[m.key] ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, [m.key]: e.target.value.replace(/[^\d.]/g, '') })
                  }
                />
              </Field>
              <button
                type="button"
                className="btn btn-primary mt-4"
                disabled={busy === m.key || draft[m.key] === String(prices[m.key] ?? '')}
                onClick={() => void save(m.key)}
              >
                {busy === m.key ? <Spinner size={14} /> : null}
                保存
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ---------------- 密码重置审核（用户与权益 → 密码重置） ---------------- */

/**
 * 「忘记密码」申请的审核台。
 *
 * 学员在登录页提交「手机号 + 新密码」后，这里会出现待审记录；
 * 管理员核对身份（例如对方提供了手机号、昵称、付款记录）后点「批准」，
 * 新密码才真正写入账号 —— 避免仅凭手机号就被他人改密盗号。
 * 系统限制同一手机号 24 小时内最多提交 3 次。
 */
function PasswordResetPanel() {
  const auth = useAuth()
  const toast = useToast()
  const { confirm, dialog } = useConfirm()
  const [rows, setRows] = useState<PasswordResetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await adminListPasswordResets(auth.user?.id ?? '', auth.user?.token ?? null))
    } catch (err) {
      setError(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [auth.user?.id, auth.user?.token])

  useEffect(() => {
    void load()
  }, [load])

  const resolve = async (row: PasswordResetRow, approve: boolean) => {
    if (approve) {
      const ok = await confirm({
        title: '批准密码重置',
        message: `确认批准 ${row.nickname || row.phone} 的密码重置申请？批准后该账号的密码将立即变为其申请时填写的新密码，请确认已核实对方身份。`,
        confirmText: '批准并生效',
      })
      if (!ok) return
    }
    setBusyId(row.id)
    try {
      await adminResolvePasswordReset(auth.user?.id ?? '', auth.user?.token ?? null, row.id, approve)
      toast.success(approve ? '已批准，新密码已生效' : '已拒绝该申请')
      await load()
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div className="skeleton h-40 rounded-2xl" />
  if (error) return <EmptyState title="加载失败" desc={error} />

  const pending = rows.filter((r) => r.status === 'pending')
  const handled = rows.filter((r) => r.status !== 'pending')

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-[13.5px] text-mist-100">待处理申请（{pending.length}）</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-mist-700">
          学员在登录页「忘记密码」提交后会出现在这里。请先核实对方身份（手机号 / 昵称 / 付款记录），
          再点「批准」——批准前对方的新密码不会生效。
        </p>
        {pending.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-mist-700">暂无待处理的密码重置申请</p>
        ) : (
          <div className="mt-3 space-y-2">
            {pending.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-850/60 px-3 py-2.5"
              >
                <div>
                  <p className="text-[12.5px] text-mist-200">
                    {r.phone}
                    {r.nickname ? <span className="ml-2 text-mist-500">{r.nickname}</span> : null}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-mist-700">
                    申请于 {formatDateTime(r.requestedAt)}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busyId === r.id}
                    onClick={() => void resolve(r, false)}
                  >
                    拒绝
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busyId === r.id}
                    onClick={() => void resolve(r, true)}
                  >
                    {busyId === r.id ? <Spinner size={14} /> : null}
                    批准
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {handled.length ? (
        <Card padded={false}>
          <div className="border-b border-ink-700 px-4 py-3">
            <p className="text-[13px] text-mist-200">历史记录</p>
          </div>
          <div className="divide-y divide-ink-800">
            {handled.slice(0, 20).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 px-4 py-2">
                <p className="text-[12px] text-mist-500">
                  {r.phone}
                  {r.nickname ? ` · ${r.nickname}` : ''}
                </p>
                <p className="text-[11.5px] text-mist-700">
                  <span className={r.status === 'approved' ? 'text-jade' : 'text-down'}>
                    {r.status === 'approved' ? '已批准' : '已拒绝'}
                  </span>
                  {r.handledAt ? ` · ${formatDateTime(r.handledAt)}` : ''}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      {dialog}
    </div>
  )
}

/* ---------------- 留言回复 ---------------- */

function MessagesPanel() {
  const { user } = useAuth()
  const toast = useToast()
  const { confirm, dialog } = useConfirm()
  const [rows, setRows] = useState<MessageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Record<number, string>>({})

  const load = useCallback(async () => {
    if (!user) return
    try {
      setRows(await listMessages({ uid: user?.id ?? '', token: user?.token ?? null }))
    } catch (err) {
      setError(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  const reply = async (row: MessageRow) => {
    const text = (draft[row.id] ?? '').trim()
    if (!text) return toast.error('请填写回复内容')
    try {
      await adminUpdateMessage({ uid: user?.id ?? '', token: user?.token ?? null }, row.id, { reply: text, replied_at: new Date().toISOString() })
      toast.success('已回复')
      await load()
    } catch (err) {
      toast.error(readableError(err))
    }
  }

  return loading ? (
    <div className="skeleton h-64 rounded-2xl" />
  ) : error ? (
    <EmptyState title="加载失败" desc={error} />
  ) : rows.length === 0 ? (
    <EmptyState title="还没有留言" desc="学员提交疑问后会出现在这里。" />
  ) : (
    <div className="space-y-3">
      {dialog}
      {rows.map((row) => (
        <Card key={row.id}>
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-mist-700">
            <span className="text-mist-300">{row.author_name || '学员'}</span>
            {row.is_private ? <span>私密</span> : null}
            {row.pinned ? <span className="text-gold-soft">置顶</span> : null}
            <span>{relativeTime(row.created_at)}</span>
            <div className="ml-auto flex gap-1.5">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await adminUpdateMessage({ uid: user?.id ?? '', token: user?.token ?? null }, row.id, { pinned: !row.pinned })
                    await load()
                  } catch (err) {
                    toast.error(readableError(err))
                  }
                }}
                className="rounded-md border border-ink-700 px-2 py-0.5 text-[11px] text-mist-500 hover:text-mist-200"
              >
                {row.pinned ? '取消置顶' : '置顶'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirm({
                    title: '删除留言',
                    message: `确定删除来自「${row.author_name || '学员'}」的这条留言？删除后无法恢复。`,
                    confirmText: '确认删除',
                  })
                  if (!ok) return
                  try {
                    await adminDeleteMessage({ uid: user?.id ?? '', token: user?.token ?? null }, row.id)
                    toast.success('已删除')
                    await load()
                  } catch (err) {
                    toast.error(readableError(err))
                  }
                }}
                className="rounded-md border border-ink-700 px-2 py-0.5 text-[11px] text-mist-500 hover:text-down"
              >
                <Trash2 size={11} className="inline" />
                删除
              </button>
            </div>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[13px] text-mist-200">{row.content}</p>
          {row.reply ? (
            <p className="mt-2 whitespace-pre-wrap rounded-lg border border-gold/25 bg-gold/[0.06] px-3 py-2 text-[12.5px] text-mist-300">
              {row.reply}
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <textarea
              className="field min-h-[64px] resize-y"
              value={draft[row.id] ?? row.reply ?? ''}
              onChange={(e) => setDraft({ ...draft, [row.id]: e.target.value })}
              placeholder="管理员回复…"
            />
            <button type="button" className="btn btn-primary shrink-0" onClick={() => reply(row)}>
              回复
            </button>
          </div>
        </Card>
      ))}
    </div>
  )
}

/* ---------------- 市盈率数据维护 ---------------- */

const PE_INDEX_META = [
  { code: '000001', name: '上证指数' },
  { code: '399001', name: '深证成指' },
  { code: '399006', name: '创业板指' },
  { code: '000688', name: '科创50' },
]

function PePanel() {
  const toast = useToast()
  const [rows, setRows] = useState<PeIndexRow[]>([])
  const [regions, setRegions] = useState<PeIndustryRow[]>([])
  const [macros, setMacros] = useState<PeIndustryRow[]>([])
  /** 行业列表视图：地域指数 / 宏观行业指数 */
  const [indKind, setIndKind] = useState<'region' | 'industry'>('region')
  const industries = indKind === 'region' ? regions : macros
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [kind, setKind] = useState<'daily' | 'monthly' | 'snapshot'>('daily')
  const [values, setValues] = useState<Record<string, string>>({})
  const [closes, setCloses] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<PeIndustryRow | null>(null)
  const [industryForm, setIndustryForm] = useState({
    industry_name: '',
    pe_ttm: '',
    hist_min_pe: '',
    hist_min_date: '',
    market_cap: '',
  })

  const load = useCallback(async () => {
    try {
      const [idx, ind, mac] = await Promise.all([
        listPeIndex(),
        listPeIndustry('region'),
        listPeIndustry('industry'),
      ])
      setRows(idx)
      setRegions(ind)
      setMacros(mac)
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const saveIndex = async () => {
    const payload = PE_INDEX_META.map((m) => ({
      index_code: m.code,
      index_name: m.name,
      pe_date: date,
      pe_ttm: Number(values[m.code] ?? ''),
      close_price: closes[m.code] ? Number(closes[m.code]) : null,
      kind,
    })).filter((r) => Number.isFinite(r.pe_ttm))
    if (!payload.length) return toast.error('至少填写一个指数的市盈率')
    setBusy(true)
    try {
      await upsertPeIndex(payload)
      toast.success(`已保存 ${payload.length} 个指数的 ${date} 数据`)
      setValues({})
      setCloses({})
      await load()
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  const saveIndustry = async () => {
    if (!editing) return
    setBusy(true)
    try {
      await updatePeIndustry(editing.industry_code, {
        industry_name: industryForm.industry_name.trim() || null,
        pe_ttm: industryForm.pe_ttm.trim() === '' ? null : Number(industryForm.pe_ttm),
        pe_date: industryForm.pe_ttm.trim() === '' ? null : date,
        hist_min_pe: industryForm.hist_min_pe.trim() === '' ? null : Number(industryForm.hist_min_pe),
        hist_min_date: industryForm.hist_min_date || null,
        market_cap: industryForm.market_cap.trim() === '' ? null : Number(industryForm.market_cap),
      } as Partial<PeIndustryRow>)
      toast.success('行业数据已更新')
      setEditing(null)
      await load()
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="skeleton h-64 rounded-2xl" />

  return (
    <div className="space-y-4">
      <Card>
        <p className="mb-3 text-[13.5px] text-mist-100">指数市盈率 TTM 录入</p>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="数据日期">
            <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="类型" hint="daily=日频数据（每交易日自动写入）；monthly/snapshot 为历史口径">
            <select
              className="field"
              value={kind}
              onChange={(e) => setKind(e.target.value as 'daily' | 'monthly' | 'snapshot')}
            >
              <option value="daily">日频数据（推荐）</option>
              <option value="monthly">月度数据（历史）</option>
              <option value="snapshot">年度快照（历史）</option>
            </select>
          </Field>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-700 text-left text-mist-700">
                <th className="py-2 font-medium">指数</th>
                <th className="py-2 font-medium">市盈率 TTM</th>
                <th className="py-2 font-medium">收盘价（选填）</th>
              </tr>
            </thead>
            <tbody>
              {PE_INDEX_META.map((m) => (
                <tr key={m.code} className="border-b border-ink-800/70">
                  <td className="py-2 pr-3 text-mist-200">
                    {m.name}
                    <span className="ml-1.5 text-[11px] text-mist-700">{m.code}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className="field"
                      inputMode="decimal"
                      value={values[m.code] ?? ''}
                      onChange={(e) => setValues({ ...values, [m.code]: e.target.value.replace(/[^\d.]/g, '') })}
                      placeholder="15.4122"
                    />
                  </td>
                  <td className="py-2">
                    <input
                      className="field"
                      inputMode="decimal"
                      value={closes[m.code] ?? ''}
                      onChange={(e) => setCloses({ ...closes, [m.code]: e.target.value.replace(/[^\d.]/g, '') })}
                      placeholder="3813.79"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn btn-primary mt-3" onClick={saveIndex} disabled={busy}>
          {busy ? <Spinner size={14} /> : <Save size={14} />}
          保存指数数据
        </button>
        <p className="mt-2 text-[11.5px] text-mist-700">
          同一「指数 + 日期」重复保存会覆盖。已有 {rows.length} 个日频观测点（2015 年至今，每交易日收盘后自动更新）。
        </p>
      </Card>

      <Card padded={false}>
        <div className="border-b border-ink-700 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[13.5px] text-mist-100">
              {indKind === 'region'
                ? '同花顺地域指数市盈率（882001~882033）'
                : '同花顺宏观行业指数市盈率（一级行业）'}
            </p>
            <div className="flex overflow-hidden rounded-lg border border-ink-700 text-[11.5px]">
              {(
                [
                  ['region', '地域指数'],
                  ['industry', '宏观行业'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setIndKind(key)}
                  className={cn(
                    'px-2.5 py-1 transition',
                    indKind === key ? 'bg-gold/12 text-gold-soft' : 'text-mist-500 hover:bg-ink-850',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-0.5 text-[11.5px] text-mist-700">
            点击行可填写{indKind === 'region' ? '地区' : '行业'}名称、当日市盈率与总市值；
            填入市盈率时会以当前日期记录（每交易日收盘后任务自动更新）
          </p>
        </div>
        <div className="max-h-[52vh] overflow-y-auto">
          <table className="w-full min-w-[680px] text-[12.5px]">
            <thead className="sticky top-0 bg-ink-900">
              <tr className="border-b border-ink-700 text-left text-mist-700">
                <th className="px-4 py-2 font-medium">代码</th>
                <th className="px-3 py-2 font-medium">行业</th>
                <th className="px-3 py-2 text-right font-medium">当日 PE</th>
                <th className="px-3 py-2 text-right font-medium">历史最低</th>
                <th className="px-4 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {industries.map((row) => (
                <tr
                  key={row.id}
                  className={cn('border-b border-ink-800/70', editing?.id === row.id && 'bg-gold/8')}
                >
                  <td className="px-4 py-2 tabular-nums text-mist-300">{row.industry_code}</td>
                  <td className="px-3 py-2 text-mist-400">{row.industry_name || '待接入'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-mist-200">
                    {row.pe_ttm === null ? '—' : Number(row.pe_ttm).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-down">
                    {row.hist_min_pe === null ? '—' : Number(row.hist_min_pe).toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className="rounded-md border border-ink-700 px-2 py-0.5 text-[11.5px] text-mist-500 hover:text-mist-200"
                      onClick={() => {
                        setEditing(row)
                        setIndustryForm({
                          industry_name: row.industry_name ?? '',
                          pe_ttm: row.pe_ttm === null ? '' : String(row.pe_ttm),
                          hist_min_pe: row.hist_min_pe === null ? '' : String(row.hist_min_pe),
                          hist_min_date: row.hist_min_date ?? '',
                          market_cap: row.market_cap === null || row.market_cap === undefined ? '' : String(row.market_cap),
                        })
                      }}
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editing ? (
          <div className="border-t border-ink-700 p-4">
            <p className="mb-3 text-[13px] text-mist-100">编辑地域指数 {editing.industry_code}</p>
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="地区名称">
                <input
                  className="field"
                  value={industryForm.industry_name}
                  onChange={(e) => setIndustryForm({ ...industryForm, industry_name: e.target.value })}
                />
              </Field>
              <Field label="当月 PE-TTM">
                <input
                  className="field"
                  inputMode="decimal"
                  value={industryForm.pe_ttm}
                  onChange={(e) =>
                    setIndustryForm({ ...industryForm, pe_ttm: e.target.value.replace(/[^\d.]/g, '') })
                  }
                />
              </Field>
              <Field label="历史最低 PE">
                <input
                  className="field"
                  inputMode="decimal"
                  value={industryForm.hist_min_pe}
                  onChange={(e) =>
                    setIndustryForm({ ...industryForm, hist_min_pe: e.target.value.replace(/[^\d.]/g, '') })
                  }
                />
              </Field>
              <Field label="最低位日期">
                <input
                  className="field"
                  type="date"
                  value={industryForm.hist_min_date}
                  onChange={(e) => setIndustryForm({ ...industryForm, hist_min_date: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-primary" onClick={saveIndustry} disabled={busy}>
                {busy ? <Spinner size={14} /> : <Save size={14} />}
                保存
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                <X size={14} />
                取消
              </button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  )
}

/* ---------------- 换绑审核 ---------------- */

function PhonePanel() {
  const toast = useToast()
  const [rows, setRows] = useState<PhoneChangeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ old_phone: '', new_phone: '', remark: '' })

  const load = useCallback(async () => {
    try {
      setRows(await listPhoneChanges())
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
    <div className="space-y-4">
      <Card>
        <p className="mb-3 text-[13.5px] text-mist-100">登记一条换绑申请</p>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="原手机号">
            <input
              className="field"
              inputMode="numeric"
              maxLength={11}
              value={form.old_phone}
              onChange={(e) => setForm({ ...form, old_phone: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label="新手机号">
            <input
              className="field"
              inputMode="numeric"
              maxLength={11}
              value={form.new_phone}
              onChange={(e) => setForm({ ...form, new_phone: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label="备注">
            <input
              className="field"
              value={form.remark}
              onChange={(e) => setForm({ ...form, remark: e.target.value })}
            />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              className="btn btn-ghost w-full"
              onClick={async () => {
                try {
                  await createPhoneChange({
                    old_phone: `+86 ${form.old_phone}`,
                    new_phone: `+86 ${form.new_phone}`,
                    remark: form.remark || undefined,
                  })
                  toast.success('已登记')
                  setForm({ old_phone: '', new_phone: '', remark: '' })
                  await load()
                } catch (err) {
                  toast.error(readableError(err))
                }
              }}
            >
              登记
            </button>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="skeleton h-40 rounded-2xl" />
      ) : error ? (
        <EmptyState title="加载失败" desc={error} />
      ) : rows.length === 0 ? (
        <EmptyState title="还没有换绑申请" />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 px-3.5 py-2.5 text-[12.5px]"
            >
              <span className="text-mist-200">{row.old_phone}</span>
              <span className="text-mist-700">→</span>
              <span className="text-mist-200">{row.new_phone}</span>
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[11px]',
                  row.status === 'done'
                    ? 'bg-emerald-500/12 text-emerald-300'
                    : row.status === 'rejected'
                      ? 'bg-up/12 text-up'
                      : 'bg-gold/12 text-gold-soft',
                )}
              >
                {row.status === 'done' ? '已完成' : row.status === 'rejected' ? '已驳回' : '待处理'}
              </span>
              <span className="text-mist-700">{relativeTime(row.created_at)}</span>
              {row.status === 'pending' ? (
                <div className="ml-auto flex gap-1.5">
                  <button
                    type="button"
                    className="rounded-md border border-emerald-500/40 px-2 py-0.5 text-[11.5px] text-emerald-300"
                    onClick={async () => {
                      try {
                        await updatePhoneChange(row.id, {
                          status: 'done',
                          handled_at: new Date().toISOString(),
                        })
                        toast.success('已标记完成，记得同步迁移权益')
                        await load()
                      } catch (err) {
                        toast.error(readableError(err))
                      }
                    }}
                  >
                    标记完成
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-ink-700 px-2 py-0.5 text-[11.5px] text-mist-500 hover:text-down"
                    onClick={async () => {
                      try {
                        await updatePhoneChange(row.id, { status: 'rejected' })
                        await load()
                      } catch (err) {
                        toast.error(readableError(err))
                      }
                    }}
                  >
                    驳回
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          <p className="text-[11.5px] text-mist-700">
            标记完成后请到「用户与权益」把权益迁移到新号，并将原号到期时间置空下线。
          </p>
        </div>
      )}
    </div>
  )
}

/* ---------------- 订单确认（对账） ---------------- */

/**
 * 作业管理：发布/编辑作业 → 学员在「高级学员 · 作业」页提交 → 这里查看与批改。
 * （此前只有学员端页面与两张数据表，讲师无处发布，链路是断的。）
 */
function HomeworkPanel() {
  const toast = useToast()
  const { confirm, dialog } = useConfirm()
  const [rows, setRows] = useState<HomeworkRow[]>([])
  const [submits, setSubmits] = useState<SubmitRow[]>([])
  const [active, setActive] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<HomeworkRow | null>(null)
  const [form, setForm] = useState({ title: '', period: '', deadline: '', content: '' })
  /** 批改草稿：提交 id → { score, review } */
  const [gradeDraft, setGradeDraft] = useState<Record<number, { score: string; review: string }>>({})

  const load = useCallback(async () => {
    try {
      setRows(await listHomework())
    } catch (err) {
      setError(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const resetForm = () => {
    setForm({ title: '', period: '', deadline: '', content: '' })
    setEditing(null)
  }

  const startEdit = (row: HomeworkRow) => {
    setEditing(row)
    setForm({
      title: row.title,
      period: row.period ?? '',
      deadline: row.deadline ?? '',
      content: row.content ?? '',
    })
  }

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error('请填写作业标题')
      return
    }
    setBusy(true)
    try {
      await saveHomeworkAdmin({
        id: editing?.id,
        title: form.title.trim(),
        period: form.period.trim(),
        content: form.content,
        deadline: form.deadline || null,
      })
      toast.success(editing ? '作业已更新' : '作业已发布')
      resetForm()
      await load()
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (row: HomeworkRow) => {
    const ok = await confirm({
      title: '删除作业',
      message: `确定删除「${row.title}」？该作业下学员的全部提交也会一并删除，且不可恢复。`,
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteHomeworkAdmin(row.id)
      toast.success('已删除')
      if (active === row.id) setActive(null)
      await load()
    } catch (err) {
      toast.error(readableError(err))
    }
  }

  const toggleSubmits = async (id: number) => {
    if (active === id) {
      setActive(null)
      return
    }
    setActive(id)
    try {
      setSubmits(await listSubmits(id))
    } catch (err) {
      toast.error(readableError(err))
    }
  }

  const grade = async (sub: SubmitRow) => {
    const draft = gradeDraft[sub.id] ?? { score: sub.score === null ? '' : String(sub.score), review: sub.review ?? '' }
    const scoreNum = draft.score.trim() === '' ? null : Number(draft.score)
    if (scoreNum !== null && (!Number.isFinite(scoreNum) || scoreNum < 0 || scoreNum > 100)) {
      toast.error('分数需为 0~100 的数字')
      return
    }
    try {
      await gradeSubmitAdmin(sub.id, scoreNum, draft.review.trim() || null)
      toast.success('批改已保存')
      if (active) setSubmits(await listSubmits(active))
    } catch (err) {
      toast.error(readableError(err))
    }
  }

  if (loading) return <div className="skeleton h-40 rounded-2xl" />
  if (error) return <EmptyState title="加载失败" desc={error} />

  return (
    <div className="space-y-4">
      {/* 发布 / 编辑 */}
      <Card>
        <h2 className="text-[14.5px] text-mist-100">{editing ? `编辑作业：${editing.title}` : '发布新作业'}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="标题">
            <input
              className="field"
              value={form.title}
              placeholder="如：第 3 期 · 现金流折现练习"
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="期次" hint="如 2026-Q4">
            <input
              className="field"
              value={form.period}
              placeholder="选填"
              onChange={(e) => setForm({ ...form, period: e.target.value })}
            />
          </Field>
          <Field label="截止日期">
            <input
              className="field"
              type="date"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="作业要求" hint="支持 Markdown">
            <textarea
              className="field min-h-[120px]"
              value={form.content}
              placeholder="写明题目要求、提交格式与评分标准…"
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
          </Field>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
            {busy ? <Spinner size={14} /> : null}
            {editing ? '保存修改' : '发布作业'}
          </button>
          {editing ? (
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              取消编辑
            </button>
          ) : null}
        </div>
      </Card>

      {/* 作业列表 */}
      <Card padded={false}>
        <div className="border-b border-ink-700 px-4 py-3">
          <h2 className="text-[14.5px] text-mist-100">已发布作业（{rows.length}）</h2>
          <p className="mt-0.5 text-[11.5px] text-mist-700">
            点击「查看提交」可展开学员作答并批改评分；学员在「高级学员 · 作业」页提交。
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] text-mist-700">还没有作业，用上方表单发布第一期吧。</p>
        ) : (
          <div className="divide-y divide-ink-800">
            {rows.map((row) => (
              <div key={row.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[13px] text-mist-100">
                      {row.title}
                      {row.period ? <span className="ml-2 text-[11.5px] text-mist-700">{row.period}</span> : null}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-mist-700">
                      发布 {formatDate(row.published_at)}
                      {row.deadline ? ` · 截止 ${row.deadline}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button type="button" className="btn btn-ghost" onClick={() => void toggleSubmits(row.id)}>
                      {active === row.id ? '收起提交' : '查看提交'}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => startEdit(row)}>
                      编辑
                    </button>
                    <button type="button" className="btn btn-ghost text-down" onClick={() => void remove(row)}>
                      删除
                    </button>
                  </div>
                </div>

                {active === row.id ? (
                  <div className="mt-3 space-y-2 rounded-xl border border-ink-700 bg-ink-900/60 p-3">
                    {submits.length === 0 ? (
                      <p className="py-3 text-center text-[12px] text-mist-700">还没有学员提交</p>
                    ) : (
                      submits.map((s) => {
                        const draft = gradeDraft[s.id] ?? {
                          score: s.score === null ? '' : String(s.score),
                          review: s.review ?? '',
                        }
                        return (
                          <div key={s.id} className="rounded-lg border border-ink-700 bg-ink-850/60 p-3">
                            <p className="text-[12px] text-mist-400">
                              {s.user_name || '同学'}
                              <span className="ml-2 text-[11.5px] text-mist-700">{formatDateTime(s.submitted_at)}</span>
                              {s.score !== null ? (
                                <span className="ml-2 text-[11.5px] text-gold-soft">已评分 {Number(s.score)}</span>
                              ) : (
                                <span className="ml-2 text-[11.5px] text-mist-700">未批改</span>
                              )}
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-mist-200">{s.content}</p>
                            <div className="mt-2 flex flex-wrap items-end gap-2">
                              <div className="w-24">
                                <Field label="分数">
                                  <input
                                    className="field"
                                    inputMode="numeric"
                                    value={draft.score}
                                    placeholder="0-100"
                                    onChange={(e) =>
                                      setGradeDraft({ ...gradeDraft, [s.id]: { ...draft, score: e.target.value } })
                                    }
                                  />
                                </Field>
                              </div>
                              <div className="min-w-[200px] flex-1">
                                <Field label="评语">
                                  <input
                                    className="field"
                                    value={draft.review}
                                    placeholder="给学员的反馈"
                                    onChange={(e) =>
                                      setGradeDraft({ ...gradeDraft, [s.id]: { ...draft, review: e.target.value } })
                                    }
                                  />
                                </Field>
                              </div>
                              <button type="button" className="btn btn-primary" onClick={() => void grade(s)}>
                                保存批改
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
      {dialog}
    </div>
  )
}

function OrdersPanel({ onDone }: { onDone: () => void }) {
  const toast = useToast()
  const { confirm, dialog } = useConfirm()
  // 订单含用户手机号：读取与变更都走服务端校验的 RPC，需要带上登录时签发的凭据
  const { user } = useAuth()
  const auth = useMemo<SessionAuth>(() => ({ uid: user?.id ?? '', token: user?.token ?? null }), [user])
  const [rows, setRows] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<{ id: number; kind: 'confirm' | 'cancel' | 'restore' } | null>(null)

  const load = useCallback(async () => {
    if (!auth.uid || !auth.token) {
      setError('登录凭据已失效，请重新登录后重试')
      setLoading(false)
      return
    }
    try {
      setRows(await listOrdersAdmin(auth))
    } catch (err) {
      setError(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [auth])

  useEffect(() => {
    void load()
  }, [load])

  const pending = rows.filter((r) => r.status === 'pending')
  const confirmed = rows.filter((r) => r.status === 'confirmed')
  const cancelled = rows.filter((r) => r.status === 'cancelled')
  const sum = (list: OrderRow[]) => list.reduce((acc, r) => acc + (Number(r.amount) || 0), 0)

  const isBusy = (row: OrderRow) => busy?.id === row.id
  const busyLabel = (row: OrderRow, kind: 'confirm' | 'cancel' | 'restore') =>
    busy?.id === row.id && busy.kind === kind ? '处理中…' : null

  const run = async (row: OrderRow, kind: 'confirm' | 'cancel' | 'restore', fn: () => Promise<void>) => {
    setBusy({ id: row.id, kind })
    try {
      await fn()
      await load()
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setBusy(null)
    }
  }

  const confirmOrder = async (row: OrderRow) => {
    const days = row.product_type === 'master' ? '高级学员权益 90 天' : '学员权益 30 天'
    const ok = await confirm({
      title: '确认收款',
      message: `确认订单 #${row.id}（${row.product_name} · ¥${row.amount}）已收到款项？确认后将同时为该手机号 ${row.phone ?? "—"} 发放/顺延 ${days}，无需再到「用户与权益」手动发放。`,
      confirmText: '确认并发放权益',
    })
    if (!ok) return
    await run(row, 'confirm', async () => {
      const res = await confirmOrderAdmin(auth, row.id, true)
      if (res.granted) {
        const until = res.masterExpireAt ?? res.memberExpireAt
        toast.success(`#${row.id} 已确认，${days}已发放${until ? `至 ${until}` : ''}`)
      } else {
        toast.success(`#${row.id} 已确认（该订单此前已发放过权益或用户不存在，未重复发放）`)
      }
      onDone()
    })
  }

  const cancelOrder = async (row: OrderRow) => {
    const ok = await confirm({
      title: '取消订单',
      message: `确定取消订单 #${row.id}（${row.product_name} · ¥${row.amount}）？取消后该订单作废、不再计入待确认，学员需重新提交。`,
      confirmText: '取消订单',
      danger: true,
    })
    if (!ok) return
    await run(row, 'cancel', async () => {
      await updateOrderAdmin(auth, row.id, 'cancelled', null)
      toast.success(`#${row.id} 已取消`)
    })
  }

  const restoreOrder = (row: OrderRow) =>
    run(row, 'restore', async () => {
      await updateOrderAdmin(auth, row.id, 'pending', null)
      toast.success(`#${row.id} 已恢复为待确认`)
    })

  if (loading) return <div className="skeleton h-40 rounded-2xl" />
  if (error) return <EmptyState title="加载失败" desc={error} />
  if (rows.length === 0) return <EmptyState title="还没有订单" />

  return (
    <div className="space-y-3">
      {dialog}
      <div className="flex flex-wrap gap-2 text-[12px]">
        <span className="rounded-lg border border-gold/30 bg-gold/[0.06] px-3 py-1.5 text-gold-soft">
          待确认 {pending.length} 单 · ¥{sum(pending)}
        </span>
        <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-1.5 text-emerald-300">
          已开通 {confirmed.length} 单 · ¥{sum(confirmed)}
        </span>
        {cancelled.length > 0 ? (
          <span className="rounded-lg border border-ink-600 px-3 py-1.5 text-mist-600">
            已取消 {cancelled.length} 单 · ¥{sum(cancelled)}
          </span>
        ) : null}
        <span className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-1.5 text-mist-500">
          累计流水 ¥{sum(pending) + sum(confirmed)}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full min-w-[920px] text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-700 bg-ink-900 text-left text-mist-700">
              <th className="px-3 py-2 font-medium">订单号</th>
              <th className="px-3 py-2 font-medium">产品</th>
              <th className="px-3 py-2 text-right font-medium">金额</th>
              <th className="px-3 py-2 font-medium">手机号</th>
              <th className="px-3 py-2 font-medium">昵称 / 备注</th>
              <th className="px-3 py-2 font-medium">提交时间</th>
              <th className="px-3 py-2 font-medium">状态</th>
              <th className="px-3 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={cn('border-b border-ink-800/70', row.status === 'cancelled' && 'opacity-60')}
              >
                <td className="px-3 py-2.5 tabular-nums text-mist-500">#{row.id}</td>
                <td className="px-3 py-2.5 text-mist-200">
                  {row.product_name}
                  {row.quantity && row.quantity > 1 ? (
                    <span className="ml-1.5 text-[11.5px] text-gold-soft">
                      × {row.quantity} 份 · {row.days ?? row.quantity * 30} 天
                    </span>
                  ) : row.days && row.days !== 30 && row.product_type !== 'master' ? (
                    <span className="ml-1.5 text-[11.5px] text-mist-600">{row.days} 天</span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gold-soft">
                  {Number(row.amount) === 0 ? (
                    /* 免费开通的订单与正常付费订单在金额上无法区分，单独打标便于对账 */
                    <span className="rounded border border-purple-500/40 bg-purple-500/10 px-1.5 py-0.5 text-[11px] text-purple-200">
                      赠送·免费
                    </span>
                  ) : (
                    `¥${row.amount}`
                  )}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-mist-300">{row.phone ?? '—'}</td>
                <td className="px-3 py-2.5 text-mist-600">
                  {row.nickname ? <span className="text-mist-400">{row.nickname}</span> : null}
                  {row.nickname && row.remark ? ' · ' : ''}
                  {row.remark ?? (row.nickname ? '' : '—')}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-mist-600">{formatDateTime(row.created_at)}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[11px]',
                      row.status === 'confirmed'
                        ? 'bg-emerald-500/12 text-emerald-300'
                        : row.status === 'cancelled'
                          ? 'bg-ink-750 text-mist-600'
                          : 'bg-gold/12 text-gold-soft',
                    )}
                  >
                    {row.status === 'confirmed' ? '已开通' : row.status === 'cancelled' ? '已取消' : '待确认'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  {row.status === 'pending' ? (
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={isBusy(row)}
                        onClick={() => void confirmOrder(row)}
                        className="rounded-md border border-emerald-500/40 px-2 py-0.5 text-[11.5px] text-emerald-300 transition hover:bg-emerald-500/10 disabled:opacity-50"
                      >
                        {busyLabel(row, 'confirm') ?? '确认收款并开通'}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy(row)}
                        onClick={() => void cancelOrder(row)}
                        className="rounded-md border border-ink-600 px-2 py-0.5 text-[11.5px] text-mist-500 transition hover:border-ink-500 hover:text-mist-300 disabled:opacity-50"
                      >
                        {busyLabel(row, 'cancel') ?? '取消订单'}
                      </button>
                    </div>
                  ) : row.status === 'confirmed' ? (
                    <span className="text-[11px] text-mist-700">
                      {row.confirmed_at ? formatDateTime(row.confirmed_at) : ''}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy(row)}
                      onClick={() => void restoreOrder(row)}
                      className="rounded-md border border-ink-700 px-2 py-0.5 text-[11px] text-mist-600 transition hover:border-ink-600 hover:text-mist-400 disabled:opacity-50"
                    >
                      {busyLabel(row, 'restore') ?? '恢复待确认'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11.5px] text-mist-700">
        确认收款后请到「用户与权益」为该手机号发放或顺延对应天数（学员 30 天 / 高级学员 90 天）。
        未到账或信息有误的待确认订单可点「取消订单」作废（可恢复）；「累计流水」不含已取消订单。
        付款备注中的手机号后四位可用于与微信账单逐笔对账。
      </p>
    </div>
  )
}

/** 后台也可上传高级学员资料，入口保留在资ng 模块，这里给一个快捷写入 */
export function AdminMaterialQuickAdd() {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [mtype, setMtype] = useState('讲义')
  const [url, setUrl] = useState('')

  return (
    <Card>
      <p className="mb-3 text-[13.5px] text-mist-100">快速新增高级学员资料</p>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="标题">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="类型">
          <input className="field" value={mtype} onChange={(e) => setMtype(e.target.value)} />
        </Field>
        <Field label="文件外链">
          <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <div className="flex items-end">
          <button
            type="button"
            className="btn btn-ghost w-full"
            onClick={async () => {
              try {
                await adminSaveMaterial({
                  title: title.trim(),
                  mtype: mtype.trim() || '讲义',
                  file_url: url.trim() || null,
                  sort_order: 0,
                })
                toast.success('已新增')
                setTitle('')
                setUrl('')
              } catch (err) {
                toast.error(readableError(err))
              }
            }}
          >
            新增
          </button>
        </div>
      </div>
    </Card>
  )
}
