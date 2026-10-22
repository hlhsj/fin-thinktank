import { Link } from 'react-router-dom'
import { ArrowLeft, Bell, KeyRound } from 'lucide-react'
import { Card, Disclaimer, PageHeader } from '../components/PageHeader'
import { daysLeft, isMasterValid, isMemberValid, useAuth } from '../context/AuthContext'
import { SITE } from '../lib/site'

/**
 * 用户信息页（/member/profile）。
 *
 * 由右上角用户名窗口进入：展示账号资料、权益有效期与当前状态，
 * 原先首页顶部的「学员权益 / 高级学员权益 / 账号 / 状态」四张卡片已整体迁入本页。
 */

function ExpiryCard({
  title,
  expireAt,
  accent,
}: {
  title: string
  expireAt: string | null
  accent: string
}) {
  const left = daysLeft(expireAt)
  return (
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full opacity-20 blur-2xl"
        style={{ background: `radial-gradient(circle,${accent},transparent 65%)` }}
      />
      <p className="text-[12px] text-mist-700">{title}</p>
      <p className="mt-1.5 text-[22px] font-semibold text-mist-100">
        {left === null ? '未开通' : left <= 0 ? '已到期' : `${left} 天`}
      </p>
      <p className="mt-0.5 text-[11.5px] text-mist-700">
        {expireAt ? `${expireAt} 到期` : '在续费页开通后可见'}
      </p>
    </Card>
  )
}

export function UserProfilePage() {
  const { user } = useAuth()
  const master = isMasterValid(user)
  const member = isMemberValid(user)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="User Center"
        title="用户信息"
        desc="账号资料、权益有效期与当前状态一览。"
        right={
          <Link to="/member" className="btn btn-ghost">
            <ArrowLeft size={14} />
            返回首页
          </Link>
        }
      />

      {/* 基本信息 */}
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <span className="serif flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/25 to-transparent text-[24px] text-gold-soft">
            {(user?.displayName ?? '学').slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="serif text-[19px] text-mist-100">{user?.displayName}</span>
              {user?.isAdmin ? (
                <span className="chip border-gold/45 bg-gold/10 text-gold-soft">管理员</span>
              ) : null}
              {master ? (
                <span className="chip border-purple-500/35 bg-purple-500/10 text-purple-200">高级学员</span>
              ) : member ? (
                <span className="chip border-jade/40 text-jade">学员</span>
              ) : (
                <span className="chip">待开通</span>
              )}
            </p>
            <p className="mt-1 text-[12.5px] text-mist-500">
              账号：<span className="tabular-nums text-mist-300">{user?.phone}</span>
              {user?.nickname ? <> · 昵称：{user.nickname}</> : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/profile/change-phone" className="btn btn-ghost">
              <KeyRound size={14} />
              修改手机号
            </Link>
            <Link to="/pay" className="btn btn-primary">
              续费 / 开通
            </Link>
          </div>
        </div>
      </Card>

      {/* 权益与状态（原首页顶部四卡，已迁入本页） */}
      <section>
        <h2 className="mb-3 text-[15px] text-mist-200">权益与状态</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ExpiryCard title="学员权益" expireAt={user?.memberExpireAt ?? null} accent="var(--accent-gold)" />
          <ExpiryCard
            title="高级学员权益"
            expireAt={user?.masterExpireAt ?? null}
            accent="var(--accent-purple)"
          />
          <Card>
            <p className="text-[12px] text-mist-700">账号</p>
            <p className="mt-1.5 truncate text-[22px] font-semibold text-mist-100">{user?.phone}</p>
            <p className="mt-0.5 text-[11.5px] text-mist-700">
              {user?.masterPeriod ? `高级学员 ${user.masterPeriod}` : user?.nickname || '同学'}
            </p>
          </Card>
          <Card>
            <p className="text-[12px] text-mist-700">状态</p>
            <p className="mt-1.5 text-[22px] font-semibold text-mist-100">
              {member ? (master ? '高级学员' : '学员') : '待开通'}
            </p>
            <p className="mt-0.5 text-[11.5px] text-mist-700">
              {member ? '权益有效期内可访问对应模块' : '开通后解锁全部内容'}
            </p>
          </Card>
        </div>
      </section>

      <p className="flex items-center gap-2 text-[12px] text-mist-700">
        <Bell size={14} />
        权益、周报与回复提醒会在各模块内展示；如需调整到期时间请联系管理员（{SITE.owner}）。
      </p>

      <Disclaimer text="本站内容为客观数据统计与学习资料，仅用于学习参考，不构成投资建议。" />
    </div>
  )
}
