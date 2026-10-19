import { useEffect, useState } from 'react'
import { Check, Crown, ShieldCheck, X } from 'lucide-react'
import { Card, PageHeader } from '../components/PageHeader'
import { Field, Spinner } from '../components/ui'
import { cn, readableError } from '../lib/utils'
import { PLANS, SITE, extendFrom, type PlanKey } from '../lib/site'
import { daysLeft, useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { createOrder, readPrices } from '../services/content'

/**
 * 收款码：放在 public/ 下，构建后位于站点根目录（hash 路由下相对路径安全）。
 * 仓库内只提供占位图 `wechat-pay-qr.svg`，部署时替换为自己的收款码（jpg/png 均可，
 * 同时改这里的扩展名）。
 */
const QR_SRC = `${import.meta.env.BASE_URL}wechat-pay-qr.svg`

/**
 * 续费规则（服务端同样校验，前端仅做展示与引导）：
 * - 每个账号的权益总时长上限 **13 个月**（按 30 天/月 折算 390 天）；
 * - 单次最多买满 **12 个月**：学员权益 1 份 = 30 天 → 12 份；高级学员 1 份 = 90 天 → 4 份；
 * - 因此「剩余时长 < 1 个月」时才可一次买满；否则可购份数按剩余额度折算。
 */
const TOTAL_LIMIT_DAYS = 390
const PLAN_MAX_QTY: Record<PlanKey, number> = { member: 12, master: 4 }

/** 管理员微信号：付款后加好友、发订单号，由其核对到账并开通权益。通过环境变量注入，避免把个人账号写进仓库 */
const ADMIN_WECHAT = import.meta.env.VITE_ADMIN_WECHAT || 'your-wechat-id'

interface SubmittedOrder {
  id: number | null
  amount: number
  planName: string
  phone: string
  days: number
  quantity: number
}

export function PayPage() {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const [selected, setSelected] = useState<PlanKey>('member')
  const [phone, setPhone] = useState(user?.phone?.replace('+86 ', '') ?? '')
  const [remark, setRemark] = useState('')
  /** 购买份数：金额与天数都按份数相乘 */
  const [quantity, setQuantity] = useState(1)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState<SubmittedOrder | null>(null)

  /**
   * 价格以服务端为准（管理员可在后台「用户与权益 → 价格设置」调整）。
   * 拉取失败时回退到 site.ts 内置价，保证页面仍可用。
   */
  const [serverPrices, setServerPrices] = useState<Record<string, number>>({})
  useEffect(() => {
    readPrices()
      .then(setServerPrices)
      .catch(() => {
        /* 回退到内置价，不打断下单流程 */
      })
  }, [])
  const unitPriceOf = (key: PlanKey) => serverPrices[key] ?? (PLANS.find((p) => p.key === key)?.priceValue ?? 0)

  const plan = PLANS.find((p) => p.key === selected) ?? PLANS[0]
  const totalAmount = unitPriceOf(plan.key) * quantity
  const totalDays = plan.days * quantity

  /** 当前套餐的到期日与剩余天数 */
  const planExpire = plan.key === 'member' ? user?.memberExpireAt : user?.masterExpireAt
  const planLeftDays = Math.max(0, daysLeft(planExpire) ?? 0)
  /**
   * 本次最多可购份数 = min(单次上限, 13 个月总时长里还能容纳的份数)。
   * 例：学员剩余 30 天 → (390-30)/30 = 12 份（可买满）；剩余 100 天 → 9 份。
   */
  const maxQty = Math.min(
    PLAN_MAX_QTY[plan.key],
    Math.floor(Math.max(0, TOTAL_LIMIT_DAYS - planLeftDays) / plan.days),
  )
  /** 已达 13 个月上限，本套餐不可再购买 */
  const limitReached = maxQty < 1

  // 切换套餐或权益变化后，把已选份数收敛到新上限内
  useEffect(() => {
    setQuantity((q) => Math.min(Math.max(1, q), Math.max(1, maxQty)))
  }, [maxQty])

  const submit = async () => {
    if (!/^1\d{10}$/.test(phone.replace(/\D/g, ''))) {
      return toast.error('请填写正确的 11 位手机号')
    }
    setBusy(true)
    try {
      const normalizedPhone = `+86 ${phone.replace(/\D/g, '').slice(-11)}`
      // 下单走服务端函数：名称、单价与应发天数由服务端按产品类型和份数计算，前端不传值
      const orderId = await createOrder(
        { uid: user?.id ?? '', token: user?.token ?? null },
        {
          phone: normalizedPhone,
          nickname: user?.nickname ?? null,
          product_type: plan.key,
          quantity,
          remark: remark.trim() || null,
      })
      setSubmitted({
        id: orderId,
        amount: totalAmount,
        planName: plan.name,
        phone: normalizedPhone,
        days: totalDays,
        quantity,
      })
      toast.success('订单已提交，请扫码支付')
    } catch (err) {
      // 服务端会再次校验份数上限，把兜底错误码翻译成可读提示
      const msg = readableError(err)
      if (/QUANTITY_EXCEEDS_LIMIT/.test(msg)) {
        toast.error(`${plan.name}本次最多可购 ${maxQty} 份（账号总时长上限 13 个月）`)
      } else if (/LIMIT_REACHED/.test(msg)) {
        toast.error(`${plan.name}剩余时长较多，已达 13 个月上限，待剩余不足 1 个月时可续费`)
      } else if (/BAD_PHONE/.test(msg)) {
        toast.error('手机号格式不正确，请检查后重试')
      } else {
        toast.error(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  const finish = async () => {
    try {
      await refresh()
    } catch {
      /* 忽略：仅做一次尝试刷新 */
    }
    window.location.assign('#/member')
  }

  /* ---------- 已提交：展示微信收款码 ---------- */
  if (submitted) {
    const tail = submitted.phone.replace(/\D/g, '').slice(-4)
    return (
      <div className="mx-auto max-w-xl space-y-4 pt-6">
        <Card className="border-gold/30">
          <div className="text-center">
            <p className="serif text-[20px] text-mist-100">订单已提交，请扫码支付</p>
            <p className="mt-1 text-[12.5px] text-mist-700">
              {submitted.id ? `订单号 #${submitted.id} · ` : ''}
              支付完成后由管理员核对开通
            </p>

            <p className="mt-5 text-[30px] font-semibold text-gold-soft">
              ¥{submitted.amount}
            </p>
            <p className="mt-0.5 text-[12px] text-mist-600">
              {submitted.planName} × {submitted.quantity} 份 · 共 {submitted.days} 天
            </p>

            <div className="mx-auto mt-5 w-[240px] rounded-2xl border border-ink-700 bg-white p-3">
              <img src={QR_SRC} alt="微信收款码" className="block w-full" />
            </div>

            <p className="mt-3.5 text-[12.5px] leading-relaxed text-mist-400">
              用微信「扫一扫」付款，付款时请在备注中填写手机号后四位
              <b className="text-gold-soft"> {tail} </b>
              ，便于管理员核对到账。
            </p>

            {/* 付款后加管理员微信，由管理员核对并批准权益（该区域允许复制，便于加好友时粘贴微信号） */}
            <div
              data-allow-copy
              className="mt-5 rounded-xl border border-jade/35 bg-jade/[0.06] px-4 py-3.5 text-left"
            >
              <p className="text-[13px] text-mist-100">付款完成后，请添加管理员微信完成审核</p>
              <p className="mt-2 select-text text-[17px] font-semibold tracking-[0.04em] text-gold-soft">
                {ADMIN_WECHAT}
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mist-500">
                添加好友后，把
                {submitted.id ? `订单号 #${submitted.id} ` : '订单信息'}
                与付款截图发给管理员；核对到账后即为你批准（开通或顺延）对应权益。
              </p>
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setSubmitted(null)}>
                <X size={14} />
                取消支付
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void finish()}>
                支付完成，返回学员中心
              </button>
            </div>
          </div>
        </Card>

        <p className="text-center text-[11.5px] text-mist-700">
          订单信息（产品、金额、手机号、备注）已同步至运营后台，管理员核对到账后为你开通或顺延权益；
          到账后回到学员中心点击右上「刷新状态」即可看到新的到期时间。
        </p>
      </div>
    )
  }

  /* ---------- 选择套餐并提交 ---------- */
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Renewal"
        title="选择续费套餐"
        desc="提交订单后用微信扫码付款，管理员核对到账后开通或顺延到期时间。"
      />

      <div className="grid gap-3 md:grid-cols-2">
        {PLANS.map((p) => {
          const expire = p.key === 'member' ? user?.memberExpireAt : user?.masterExpireAt
          const left = daysLeft(expire)
          // 顺延预览按「当前选中份数」计算，避免与实际下单数量不一致造成误解
          const fold = p.key === selected ? quantity : 1
          const next = extendFrom(expire, p.days * fold)
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setSelected(p.key)}
              className={cn(
                'rounded-2xl border p-5 text-left transition',
                selected === p.key ? 'border-gold/50 bg-gold/[0.06]' : 'border-ink-700 bg-ink-900 hover:border-ink-600',
              )}
            >
              <div className="flex items-center gap-2">
                <Crown size={16} style={{ color: p.accent }} />
                <p className="text-[15px] text-mist-100">{p.name}</p>
                {selected === p.key ? <Check size={15} className="ml-auto text-gold" /> : null}
              </div>
              <p className="mt-2 text-[20px] font-semibold text-mist-100">
                ¥{unitPriceOf(p.key)} / {p.period}
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-mist-600">{p.desc}</p>
              <p className="mt-3 text-[11.5px] text-mist-700">
                当前到期：{expire ? `${expire}${left !== null && left > 0 ? `（剩 ${left} 天）` : '（已到期）'}` : '未开通'}
                <br />
                开通/顺延后：{next}
              </p>
            </button>
          )
        })}
      </div>

      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="付款手机号">
            <input
              className="field"
              type="tel"
              inputMode="numeric"
              maxLength={11}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="用于确认权益到账的手机号"
            />
          </Field>
          <Field label="备注" hint="可注明付款时间或微信昵称，便于对账">
            <input
              className="field"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="选填"
            />
          </Field>
        </div>

        {/* 购买数量：金额与应发天数随份数联动 */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-ink-700 bg-ink-850 px-4 py-3">
          <div>
            <p className="text-[13px] text-mist-200">购买数量</p>
            <p className="mt-0.5 text-[11.5px] text-mist-700">
              1 份 {plan.name} = {plan.days} 天
              {limitReached ? ' · 已达 13 个月总时长上限' : ` · 本次最多可购 ${maxQty} 份`}
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                className="btn btn-ghost px-3 py-1"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="减少数量"
              >
                −
              </button>
              <input
                className="field w-16 text-center tabular-nums"
                inputMode="numeric"
                value={quantity}
                aria-label="购买数量"
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/\D/g, ''))
                  setQuantity(Math.min(maxQty, Math.max(1, Number.isFinite(n) && n > 0 ? n : 1)))
                }}
              />
              <button
                type="button"
                className="btn btn-ghost px-3 py-1"
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                disabled={quantity >= maxQty}
                aria-label="增加数量"
              >
                ＋
              </button>
            </div>
          </div>
          <div className="pb-1 text-right">
            <p className="text-[12px] text-mist-700">应付金额</p>
            <p className="text-[22px] font-semibold tabular-nums text-gold-soft">¥{totalAmount}</p>
            <p className="text-[11.5px] text-mist-600">权益共 {totalDays} 天</p>
          </div>
        </div>

        {limitReached ? (
          <div className="mt-4 rounded-xl border border-gold/35 bg-gold/[0.06] px-4 py-3">
            <p className="text-[12.5px] text-gold-soft">该套餐已达续费上限</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-mist-500">
              每个账号的权益总时长上限为 13 个月（按 30 天/月计）。当前{plan.name}剩余 {planLeftDays} 天，
              待剩余不足 1 个月时可再次续费，单次最多 {PLAN_MAX_QTY[plan.key]} 份。
            </p>
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-ink-700 bg-ink-850 px-4 py-3">
          <p className="text-[13px] text-mist-200">开通流程</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist-500">
            提交订单 → 微信扫码付款 → 添加管理员微信{' '}
            <b className="text-mist-300">{ADMIN_WECHAT}</b>，把订单号与付款截图发给管理员 →
            管理员核对到账后为你批准（开通或顺延）权益。到账后可回到学员中心点击右上「刷新状态」查看新的到期时间。
          </p>
        </div>

        <button type="button" className="btn btn-primary mt-4 w-full" onClick={() => void submit()} disabled={busy || limitReached}>
          {busy ? <Spinner size={14} /> : <ShieldCheck size={14} />}
          提交 {plan.name} 订单（¥{totalAmount}）
        </button>
      </Card>

      <p className="text-[11.5px] text-mist-700">
        权益到账状态可在学员中心查看，或联系管理员（{SITE.owner}）核对。
      </p>
    </div>
  )
}
