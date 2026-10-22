import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  BookOpen,
  Building2,
  Calculator,
  FileText,
  GraduationCap,
  LineChart,
  MessageSquare,
  Sparkles,
} from 'lucide-react'
import { Disclaimer, PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/ui'
import { isMasterValid, useAuth } from '../context/AuthContext'
import { SITE } from '../lib/site'
import { cn, readableError, relativeTime } from '../lib/utils'
import { listChapters, listReviews } from '../services/content'

const SNAPSHOTS = [
  {
    key: 'doc',
    to: '/member/doc',
    label: '学习资料库',
    desc: '体系化教程 + 智库百科',
    icon: BookOpen,
    accent: 'var(--accent-gold)',
  },
  {
    key: 'review',
    to: '/member/review',
    label: '复盘文档库',
    desc: '每周市场复盘',
    icon: FileText,
    accent: 'var(--accent-blue)',
  },
  {
    key: 'replay',
    to: '/member/replay',
    label: '经典案例分析',
    desc: '经典案例研报',
    icon: GraduationCap,
    accent: 'var(--accent-jade)',
  },
  {
    key: 'market',
    to: '/member/market',
    label: 'A股市场数据',
    desc: 'A股温度计 + 市盈率 TTM',
    icon: LineChart,
    accent: 'var(--accent-sand)',
  },
  {
    key: 'message',
    to: '/member/message',
    label: '学员留言板',
    desc: '管理员亲自回复',
    icon: MessageSquare,
    accent: 'var(--accent-purple)',
  },
  {
    key: 'research',
    to: '/member/research',
    label: '企业研究表',
    desc: '共享研究清单',
    icon: Building2,
    accent: 'var(--accent-coral)',
  },
  {
    key: 'valuation',
    to: '/member/valuation',
    label: '股票估值实验室',
    desc: '程序化估值 · 有失真风险',
    icon: Calculator,
    accent: 'var(--accent-blue)',
  },
]

const MASTER_CARDS = [
  { to: '/member/master/ai', label: 'AI 问答', desc: '高级学员专属 · AI 助教', icon: Sparkles },
  { to: '/member/master/doc', label: '进阶研报库', desc: '课程讲义、研报、材料', icon: BookOpen },
  { to: '/member/master/culture', label: '顶级投研能力培养', desc: '每周末连麦陪跑全程记录', icon: GraduationCap },
  { to: '/member/master/homework', label: '高级学员作业', desc: '课后作业与结营材料', icon: FileText },
]

export function MemberHomePage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chapterCount, setChapterCount] = useState(0)
  /** 学习资料库最近更新时间 —— 取自 doc_chapter（此前误取复盘表，复盘为空就永远显示「暂无」） */
  const [chapterUpdatedAt, setChapterUpdatedAt] = useState<string | null>(null)
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof listReviews>>>([])

  const load = useCallback(async () => {
    try {
      // 章节读取需带服务端令牌；无权益用户会收到 NO_ENTITLEMENT —— 首页只做概览统计，
      // 此时降级为空列表即可（资料库页会给出更明确的续费提示），不要让整页报错。
      const [chapters, reviewList] = await Promise.all([
        listChapters({ uid: user?.id ?? '', token: user?.token ?? null }).catch(() => []),
        listReviews(),
      ])
      setChapterCount(
        chapters.filter((c) => c.kind === 'chapter' && /^第.+章/.test(c.title.trim())).length,
      )
      // 最近更新用 doc_chapter 自身的 max(updated_at)
      setChapterUpdatedAt(
        chapters.reduce((m, c) => {
          const d = c.updated_at ?? ''
          return d > m ? d : m
        }, '') || null,
      )
      setReviews(reviewList)
    } catch (err) {
      setError(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const master = isMasterValid(user)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Member Center"
        title={`${user?.displayName ?? '同学'}，欢迎回来`}
        desc="这里汇总本周复盘与全部功能入口；A股温度计已并入「A股市场数据」页顶部；账号资料与权益状态见右上角「用户信息」。"
        right={
          <div className="flex gap-2">
            <Link to="/pay" className="btn btn-primary">
              续费 / 开通
            </Link>
            <Link to="/master" className="btn btn-ghost">
              了解高级学员
            </Link>
          </div>
        }
      />

      {/* 权益、账号与状态已迁至「用户信息」页（右上角用户名窗口进入） */}

      {/* A股温度计已于 2026-10-20 并入「A股市场数据」页顶部（/member/market） */}

      <div>
        <h2 className="mb-3 text-[15px] text-mist-200">功能入口</h2>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <EmptyState title="加载失败" desc={error} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SNAPSHOTS.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                className={cn(
                  'group rounded-2xl border border-ink-700 bg-ink-900 p-4 transition hover:border-ink-600',
                  item.key === 'ai' && 'opacity-70',
                )}
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl border"
                  style={{
                    borderColor: `color-mix(in srgb, ${item.accent} 27%, transparent)`,
                    background: `color-mix(in srgb, ${item.accent} 8%, transparent)`,
                    color: item.accent,
                  }}
                >
                  <item.icon size={16} />
                </span>
                <p className="mt-3 text-[14px] text-mist-100 group-hover:text-gold-soft">{item.label}</p>
                <p className="mt-0.5 text-[11.5px] text-mist-700">{item.desc}</p>
              </Link>
            ))}
          </div>
        )}
        {chapterCount > 0 ? (
          <p className="mt-3 text-[11.5px] text-mist-700">
            学习资料库当前共 {chapterCount} 章，最近更新：
            {chapterUpdatedAt ? ` ${relativeTime(chapterUpdatedAt)}` : ' 暂无'}
          </p>
        ) : (
          <p className="mt-3 text-[11.5px] text-mist-700">学习资料库内容由管理员持续更新。</p>
        )}
      </div>

      {/* 高级学员专区：仅高级学员权益有效期内显示 */}
      {master ? (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-[15px] text-mist-200">高级学员专区</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MASTER_CARDS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-2xl border border-purple-500/25 bg-purple-500/5 p-4 transition hover:border-purple-500/45"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-purple-500/35 bg-purple-500/10 text-purple-200">
                  <item.icon size={16} />
                </span>
                <p className="mt-3 text-[14px] text-mist-100">{item.label}</p>
                <p className="mt-0.5 text-[11.5px] text-mist-700">{item.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <p className="flex items-center gap-2 text-[12px] text-mist-700">
        <Bell size={14} />
        权益、周报与回复提醒会在各模块内展示；如需调整到期时间请联系管理员（{SITE.owner}）。
      </p>

      <Disclaimer text="本站内容为客观数据统计与学习资料，仅用于学习参考，不构成投资建议。" />
    </div>
  )
}
