/**
 * ── 文件：src/pages/LoginPage.tsx ───────────────────────────────
 * 功能：登录 / 注册 / 忘记密码三态合一的表单页。
 * 改动指引：
 *   1. 改密码规则（当前 6 位数字）→ 校验正则与错误提示；
 *   2. 加昵称、邀请码等字段 → 表单 state + signUp 参数；
 *   3. 改登录后落地页 → 成功分支的 navigate；
 *   4. 改品牌展示 → SITE。
 * 注意：注册即开试用、密码哈希与校验都在服务端 RPC，前端只负责提交与提示。
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  BookOpen,
  GraduationCap,
  KeyRound,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { isMainlandPhone, readableError } from '../lib/utils'
import { SITE } from '../lib/site'
import { Field, Spinner } from '../components/ui'
import { requestPasswordReset } from '../services/auth'

/**
 * login  / register：常规登录与注册
 * forgot：忘记密码 —— 提交「手机号 + 新密码」生成待审申请，管理员核对身份后在后台批准才生效
 */
type Mode = 'login' | 'register' | 'forgot'

/** 登录 / 注册 / 忘记密码三态合一的表单页。 */
export function LoginPage() {
  const auth = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [nickname, setNickname] = useState('')

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  const submitAuth = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isMainlandPhone(phone)) return setError('请输入正确的 11 位手机号')
    if (!/^\d{6}$/.test(password)) return setError('密码为 6 位数字')
    if (mode !== 'login' && password !== confirm) return setError('两次输入的密码不一致')

    // 忘记密码：只生成待审申请，管理员批准后新密码才生效（避免手机号泄露即被盗号）
    if (mode === 'forgot') {
      void run(async () => {
        await requestPasswordReset(phone.trim(), password)
        toast.success('申请已提交，请联系管理员核对身份后为你批准')
        setMode('login')
        setPassword('')
        setConfirm('')
      })
      return
    }

    void run(async () => {
      const user =
        mode === 'login'
          ? await auth.signInWithPassword(phone.trim(), password)
          : await auth.signUp(phone.trim(), password, nickname)
      toast.success(`欢迎回来，${user.displayName}`)
      navigate('/member')
    })
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col px-4 py-8 lg:flex-row lg:items-center lg:gap-12 lg:py-14">
        {/* 品牌区 */}
        <section className="mb-8 lg:mb-0 lg:flex-1">
          <div className="flex items-center gap-3">
            <span className="serif flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/25 to-transparent text-[24px] text-gold-soft">
              {SITE.logoMark}
            </span>
            <div className="leading-tight">
              <p className="serif text-[20px] text-mist-100">
                {SITE.name}
                <span className="text-gold-soft"> · {SITE.subName}</span>
              </p>
              <p className="text-[11.5px] text-mist-700">主理人 {SITE.owner}</p>
            </div>
          </div>

          <h1 className="serif mt-10 max-w-lg text-[30px] leading-[1.4] text-mist-100 lg:text-[36px]">
            欢迎回来，登录后进入你的专属学习系统
          </h1>
          <p className="mt-4 max-w-md text-[13.5px] leading-relaxed text-mist-500">
            学员权益覆盖学习资料库、复盘文档库、经典案例分析、A 股市场数据、留言板与企业研究表；
            高级学员另有进阶研报库、顶级投研能力培养与作业结营。
          </p>

          {/* 三个特色小方格：手机端也并排一行，尽量少占纵向空间 */}
          <div className="mt-6 grid grid-cols-3 gap-2 sm:mt-8 sm:gap-3">
            {[
              { icon: BookOpen, title: '体系化学习', desc: '知识库' },
              { icon: Sparkles, title: '每周复盘', desc: '市场温度' },
              { icon: GraduationCap, title: '小班陪跑', desc: '研究体系' },
            ].map((f) => (
              <div
                key={f.title}
                className="flex flex-col items-center justify-center gap-1 rounded-lg border border-ink-700 bg-ink-900 px-1.5 py-2.5 text-center sm:px-2 sm:py-3"
              >
                <f.icon size={14} className="text-gold sm:h-4 sm:w-4" />
                <p className="text-[11.5px] leading-tight text-mist-100 sm:text-[12.5px]">
                  {f.title}
                </p>
                <p className="text-[10px] leading-tight text-mist-700 sm:text-[11px]">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 认证区 */}
        <section className="w-full lg:w-[420px]">
          <div className="panel p-6">
            <h2 className="serif text-[19px] text-mist-100">
              {mode === 'login' ? '登录' : '注册账号'}
            </h2>
            <p className="mt-1 text-[12.5px] text-mist-700">
              使用手机号与 6 位数字密码登录。还没有账号的话，注册只要十秒。
            </p>

            <div className="my-4 flex items-center gap-3 text-[11.5px] text-mist-700">
              <span className="h-px flex-1 bg-ink-700" />
              手机号一键登录 / 注册
              <span className="h-px flex-1 bg-ink-700" />
            </div>

            {error ? (
              <p className="mb-3 rounded-lg border border-up/35 bg-up/10 px-3 py-2 text-[12.5px] text-up">
                {error}
              </p>
            ) : null}

            <form className="space-y-3.5" onSubmit={submitAuth}>
              <Field label="手机号">
                <input
                  className="field"
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  value={phone}
                  placeholder="11 位手机号"
                  autoComplete="tel"
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              {mode === 'register' ? (
                <Field label="昵称" hint="可留空，默认显示掩码手机号">
                  <input
                    className="field"
                    maxLength={20}
                    value={nickname}
                    placeholder="给自己起个名字"
                    onChange={(e) => setNickname(e.target.value)}
                  />
                </Field>
              ) : null}
              <Field label={mode === 'forgot' ? '新密码' : '密码'} hint="6 位数字">
                <input
                  className="field tracking-[0.35em]"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={password}
                  placeholder="6 位数字密码"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  onChange={(e) => setPassword(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              {mode !== 'login' ? (
                <Field label="确认密码">
                  <input
                    className="field tracking-[0.35em]"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirm}
                    placeholder="再次输入密码"
                    autoComplete="new-password"
                    onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
                  />
                </Field>
              ) : null}

              {mode === 'forgot' ? (
                <div className="rounded-xl border border-gold/30 bg-gold/[0.06] px-3.5 py-2.5">
                  <p className="text-[11.5px] leading-relaxed text-mist-400">
                    请填写注册时使用的<b className="text-mist-200">完整手机号</b>与新的 6 位数字密码。
                    提交后由管理员核对身份（确认是本平台注册用户）后批准，<b className="text-mist-200">批准后新密码才会生效</b>；
                    在此之前原密码依然可用。
                  </p>
                </div>
              ) : null}

              <button type="submit" className="btn btn-primary w-full" disabled={busy}>
                {busy ? <Spinner size={14} /> : <KeyRound size={14} />}
                {mode === 'login' ? '一键登录' : mode === 'register' ? '注册并登录' : '提交修改申请'}
              </button>
            </form>

            <div className="mt-3 text-center text-[12.5px]">
              {mode === 'login' ? (
                <>
                  <span className="text-mist-700">还没有账号？</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register')
                      setError('')
                    }}
                    className="ml-1 text-gold transition hover:text-gold-soft"
                  >
                    注册新账号
                  </button>
                </>
              ) : (
                <>
                  <span className="text-mist-700">已有账号？</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login')
                      setError('')
                    }}
                    className="ml-1 text-gold transition hover:text-gold-soft"
                  >
                    返回登录
                  </button>
                </>
              )}
            </div>

            <div className="mt-5 space-y-1.5 border-t border-ink-700 pt-4 text-[12px]">
              <p className="flex items-center gap-2 text-mist-700">
                <AlertCircle size={13} />
                登录遇到问题？
              </p>
              <button
                type="button"
                onClick={() => {
                  setMode('forgot')
                  setError('')
                  setPassword('')
                  setConfirm('')
                }}
                className="block pl-5 text-gold transition hover:text-gold-soft"
              >
                忘记密码 → 修改密码
              </button>
              <Link to="/profile/change-phone" className="block pl-5 text-gold hover:text-gold-soft">
                权益没到账 → 修改手机号
              </Link>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="block pl-5 text-gold hover:text-gold-soft"
              >
                登录入口没出来 → 点此重试
              </button>
              <p className="pl-5 text-mist-700">仍未解决请联系管理员（主理人 {SITE.owner}）</p>
            </div>
          </div>

          <div className="mt-5 text-center text-[11.5px] text-mist-700">
            <Link to="/master" className="text-gold hover:text-gold-soft">
              想了解投研高级学员？查看介绍 →
            </Link>
          </div>
        </section>
      </div>

      <footer className="border-t border-ink-700 py-5 text-center text-[11.5px] text-mist-700">
        {SITE.fullName} · 内容仅用于学习研究，不构成投资建议
      </footer>
    </div>
  )
}
