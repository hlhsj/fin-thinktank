/**
 * ── 文件：src/components/AppShell.tsx ───────────────────────────
 * 功能：登录后的整体骨架：左侧导航（MEMBER_NAV / MASTER_NAV）、顶部栏、移动端抽屉、主题切换。
 * 改动指引：
 *   1. 加 / 删菜单 → 改 MEMBER_NAV 或 MASTER_NAV；to 必须与 App.tsx 的路由一致，
 *      master: true 表示仅高级会员可见；
 *   2. 换图标 → 从 lucide-react 引入后替换 icon 字段；
 *   3. 改侧栏宽度 / 断点 → 组件内 grid 与 md: 前缀；
 *   4. 改页脚 → 底部 SITE.fullName。
 * 注意：新增页面必须同时改这里和 App.tsx，只改一处会出现「有路由没入口」或「有入口 404」。
 */

import { useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Bot,
  Building2,
  Calculator,
  ChevronRight,
  ClipboardCheck,
  FileText,
  FlaskConical,
  GraduationCap,
  LineChart,
  LogOut,
  Menu,
  MessageSquare,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import { cn, readableError } from '../lib/utils'
import { SITE } from '../lib/site'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

interface NavItem {
  to: string
  label: string
  master?: boolean
  icon: typeof BookOpen
}

const MEMBER_NAV: NavItem[] = [
  { to: '/member', label: '首页', icon: Sparkles },
  { to: '/member/doc', label: '学习资料库', icon: BookOpen },
  { to: '/member/review', label: '复盘文档库', icon: FileText },
  { to: '/member/replay', label: '经典案例分析', icon: GraduationCap },
  { to: '/member/market', label: 'A股市场数据', icon: LineChart },
  { to: '/member/message', label: '学员留言板', icon: MessageSquare },
  { to: '/member/research', label: '企业研究表', icon: Building2 },
  { to: '/member/valuation', label: '估值实验室', icon: Calculator },
]

const MASTER_NAV: NavItem[] = [
  { to: '/member/master/ai', label: 'AI 问答', master: true, icon: Bot },
  { to: '/member/master/doc', label: '进阶研报库', master: true, icon: BookOpen },
  { to: '/member/master/culture', label: '投研能力培养', master: true, icon: FlaskConical },
  { to: '/member/master/homework', label: '高级学员作业', master: true, icon: ClipboardCheck },
]

/** 登录后整体骨架：侧栏导航 + 顶栏 + 移动端抽屉。 */
export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const { user, signOut, refresh } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const onRefresh = async () => {
    setBusy(true)
    try {
      await refresh()
      toast.success('状态已刷新')
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  const navGroups: Array<{ title: string; items: NavItem[] }> = [
    { title: '学员', items: MEMBER_NAV },
    ...(MASTER_NAV.length ? [{ title: '高级学员专属', items: MASTER_NAV }] : []),
  ]

  return (
    <div className="min-h-screen bg-ink-950">
      <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-2.5">
          <Link to="/member" className="flex shrink-0 items-center gap-2.5">
            <span className="serif flex h-9 w-9 items-center justify-center rounded-xl border border-gold/40 bg-gradient-to-br from-gold/25 to-transparent text-[18px] text-gold-soft">
              {SITE.logoMark}
            </span>
            {/* xl~2xl 之间只留图标：导航已 12 项，1440px 下 logo 文字会挤掉「投研能力培养」 */}
            <span className="hidden leading-tight sm:block xl:hidden 2xl:block">
              <span className="serif block text-[15.5px] tracking-wide text-mist-100">
                {SITE.name}
                <span className="text-gold-soft"> · {SITE.subName}</span>
              </span>
              <span className="block text-[10.5px] text-mist-700">主理人 {SITE.owner}</span>
            </span>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto xl:flex">
            {navGroups.map((group) => (
              <div key={group.title} className="flex shrink-0 items-center gap-0.5">
                {/* shrink-0 + nowrap 防止被压成竖排；2xl 以下隐藏分组标题——
                    导航已 12 项，1440px 宽度放不下两个标题（实测「高级学」被截断） */}
                <span className="hidden shrink-0 whitespace-nowrap px-2 text-[10.5px] uppercase tracking-[0.14em] text-mist-700 2xl:inline">
                  {group.title}
                </span>
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/member'}
                    className={({ isActive }) =>
                      cn(
                        'whitespace-nowrap rounded-lg px-2 py-1.5 text-[12.5px] transition',
                        isActive
                          ? item.master
                            ? 'bg-purple-500/15 text-purple-200'
                            : 'bg-gold/12 text-gold-soft'
                          : 'text-mist-500 hover:bg-ink-850 hover:text-mist-200',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {/* 学员 / 高级学员的到期时间已统一在「用户信息」页展示，顶栏不再重复 */}
            <Link
              to="/member/profile"
              title="用户信息"
              className="group flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 px-2.5 py-1.5 transition hover:border-gold/40 hover:bg-ink-850"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-[12px] text-gold-soft">
                {(user?.displayName ?? '学').slice(0, 1)}
              </span>
              <span className="hidden leading-tight md:block">
                <span className="block max-w-[120px] truncate text-[12.5px] text-mist-100">
                  {user?.displayName}
                </span>
                {/* 1280–1536 只显示昵称：导航 12 项需要这点宽度，手机号可去「用户信息」页看 */}
                <span className="hidden text-[11px] text-mist-700 2xl:block">{user?.phone ?? ''}</span>
              </span>
              <ChevronRight
                size={13}
                className="hidden text-mist-700 transition group-hover:text-gold-soft md:block"
              />
            </Link>

            <div className="flex items-center gap-1">
              <button
                type="button"
                title="刷新状态"
                onClick={onRefresh}
                disabled={busy}
                className="rounded-lg border border-ink-700 bg-ink-850 p-2 text-mist-500 transition hover:text-mist-200"
              >
                <RefreshCw size={14} className={busy ? 'animate-spin' : undefined} />
              </button>
              <Link
                to="/pay"
                title="续费 / 开通"
                className="rounded-lg border border-gold/40 bg-gold/10 px-2 py-1.5 text-[12px] text-gold-soft transition hover:bg-gold/20"
              >
                续费
              </Link>
              {user?.isAdmin ? (
                <Link
                  to="/admin"
                  title="运营后台"
                  className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-1.5 text-[12px] text-mist-300 transition hover:text-mist-100"
                >
                  后台
                </Link>
              ) : null}
              <button
                type="button"
                title="退出登录"
                onClick={async () => {
                  await signOut()
                  toast.info('已退出登录')
                  navigate('/')
                }}
                className="rounded-lg border border-ink-700 bg-ink-850 p-2 text-mist-500 transition hover:text-down"
              >
                <LogOut size={14} />
              </button>
            </div>

            <button
              type="button"
              className="rounded-lg border border-ink-700 bg-ink-850 p-2 text-mist-500 xl:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="菜单"
            >
              {open ? <X size={15} /> : <Menu size={15} />}
            </button>
          </div>
        </div>

        {open ? (
          <nav className="border-t border-ink-700 bg-ink-900 px-4 py-3 xl:hidden">
            {navGroups.map((group) => (
              <div key={group.title} className="mb-2">
                <p className="px-1 pb-1 text-[10.5px] uppercase tracking-[0.14em] text-mist-700">
                  {group.title}
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/member'}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition',
                            isActive ? 'bg-gold/12 text-gold-soft' : 'text-mist-400 hover:bg-ink-850',
                          )
                        }
                      >
                        <Icon size={14} />
                        {item.label}
                      </NavLink>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        ) : null}
      </header>

      {/*
        移动端底栏：首页 / 学习资料库 / A股市场数据 / 企业研究表。
        原先固定为「首页 + 资料库 + 复盘 + 进阶研报」，旗舰功能「A股市场数据」要开右上菜单才能到；
        这里把它提到主位（复盘文档库与进阶研报库仍可从菜单进入）。
        注意：底栏是 fixed 定位、脱离文档流，会盖住页面末尾的内容 ——
        因此 main 的 padding-bottom 必须留足「底栏高度 + 安全区」（见下方 main 的 pb 值）。
      */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-ink-700 bg-ink-900 px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:hidden">
          <div className="mx-auto grid max-w-[1400px] grid-cols-4 gap-1">
            {[MEMBER_NAV[0], MEMBER_NAV[1], MEMBER_NAV[4], MEMBER_NAV[6]].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/member'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 rounded-lg py-1 text-[11px] transition',
                  isActive ? 'text-gold-soft' : 'text-mist-600',
                )
              }
            >
              <item.icon size={15} />
              {item.label.replace('学习', '').replace('A股', '')}
            </NavLink>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-[1400px] px-4 pb-10 pt-6">{children}</main>

      {/*
        底部间距由 footer 承担（它在 main 之外，main 的 padding 管不到它）：
        移动端需留出「fixed 底栏高度 + iOS 安全区」，否则页脚会被底栏盖住；lg 以上底栏隐藏，恢复常规间距。
      */}
      <footer className="border-t border-ink-700 px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] text-center lg:pb-6">
        <p className="text-[12.5px] text-mist-500">{SITE.fullName}</p>
        <p className="mt-1 text-[11.5px] text-mist-700">
          内容仅用于学习与研究交流，不构成任何投资建议
        </p>
        <Link to="/member" className="mt-2 inline-block text-[11.5px] text-gold transition hover:text-gold-soft">
          回到首页
        </Link>
      </footer>
    </div>
  )
}
