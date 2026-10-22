import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Loader2, ShieldAlert, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { Card } from './PageHeader'
import type { StockValuationRow } from '../lib/types'
import { cn } from '../lib/utils'
import { DIM_LABELS, barTone, clampScore } from '../lib/dimDetail'
import { ValuationHistoryCard } from './ValuationHistoryCard'
import { valuateDebubble } from '../services/valuateLive'

/**
 * 估值结果视图（详情页与实时搜索结果共用）。
 *
 * 只负责渲染，不取数、不计算——数据来自云库（历史样本）或
 * 本地 API 实时计算（`services/valuateLive.ts`），两者结构完全一致。
 */

const TREND_LABELS: Record<string, { label: string; tone: string }> = {
  stable: { label: '趋势稳定', tone: 'border-ink-600 text-mist-400' },
  decelerate: { label: '降速（未转负）', tone: 'border-gold/40 text-gold-soft' },
  inflection: { label: '拐点：长期向上、短期掉头', tone: 'border-down/40 text-down' },
  stagnant: { label: '长期停滞、短期收缩', tone: 'border-down/40 text-down' },
  collapse: { label: '由盈转亏', tone: 'border-down/50 bg-down/10 text-down' },
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(digits)
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits)}%`
}

/** 分红率展示：v3.0 起低分红企业会按「留存再投资」口径修正，需标出实际采用值 */
function bLabel(row: StockValuationRow): string {
  const b = row.b
  const bu = row.b_used
  if (b === null || b === undefined) return '—'
  if (bu !== null && bu !== undefined && Math.abs(bu - b) > 0.001) {
    return `${b.toFixed(3)} → 按 ${bu.toFixed(3)} 计`
  }
  return b.toFixed(3)
}

/* ---------------- 估值区间标尺（纯 CSS） ----------------
 * 为什么不用 ECharts：标尺只有一个维度（价格轴）+ 三条参考线，
 * 而 LineChart 在「单类目 y 轴 + markArea」组合下实测渲染空白；
 * 改用绝对定位的色带与竖线，完全可控、无图表库依赖，详情页因此不再加载 echarts。
 */
function RangeRuler({ row }: { row: StockValuationRow }) {
  /* 去泡沫：按需二次计算。hooks 必须写在下面两个条件 return 之前 */
  const [dbTarget, setDbTarget] = useState<number | null>(null)
  const [dbLoading, setDbLoading] = useState(false)
  const [dbErr, setDbErr] = useState<string | null>(null)
  // 换样本时清掉上一次的结果——否则会把上一只的二次计算值带过来
  useEffect(() => {
    setDbTarget(null)
    setDbErr(null)
  }, [row.code])

  const canDb = Boolean(row.channel?.debubble?.can)
  const runDebubble = async () => {
    if (dbTarget) {
      setDbTarget(null)
      return
    }
    setDbLoading(true)
    setDbErr(null)
    try {
      const r = await valuateDebubble(row.code)
      setDbTarget(r?.applicable ? (r.target ?? null) : null)
      if (r && !r.applicable) setDbErr(r.reason ?? '无法完成去泡沫计算')
    } catch (e) {
      setDbErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDbLoading(false)
    }
  }

  const lo = row.fair_low
  const hi = row.fair_high
  const target = row.target
  const buy = row.buy
  const price = row.price

  if (row.invalid) {
    return (
      <Card>
        <h2 className="serif mb-3 text-[16px] text-mist-100">估值区间</h2>
        <p className="rounded-xl border border-down/30 bg-down/5 px-4 py-3 text-[12.5px] leading-relaxed text-down">
          {row.invalid}
        </p>
      </Card>
    )
  }
  if (lo === null || hi === null || !(hi > lo)) {
    return (
      <Card>
        <h2 className="serif mb-3 text-[16px] text-mist-100">估值区间</h2>
        <p className="py-6 text-center text-[12.5px] text-mist-700">
          该样本未进入估值阶段（L1 排雷未通过或行业规则回避）
        </p>
      </Card>
    )
  }

  /** 轴域必须覆盖全部四个价位：理论安全边际常常低于下沿（招行 38.49 < 43.30），
   *  只按 [lo, hi] 取域会把它挤出可视区、被 clamp 贴到左端，比例失真。 */
  const pts = [lo, hi, target, buy, price, dbTarget].filter(
    (v): v is number => v !== null && v !== undefined && Number.isFinite(v) && v > 0,
  )
  const dMin = Math.min(...pts)
  const dMax = Math.max(...pts)
  const span = dMax - dMin || 1
  const min = dMin - span * 0.12
  const max = dMax + span * 0.12
  /** 值 → 百分比位置（两端留 3% 边距，避免标记贴边被裁） */
  const pos = (v: number) => Math.min(97, Math.max(3, ((v - min) / (max - min)) * 100))

  const marks: Array<{ label: string; v: number; line: string; text: string; dash?: boolean }> = [
    { label: '理论安全边际', v: buy ?? NaN, line: 'bg-down', text: 'text-down', dash: true },
    { label: '公平价', v: target ?? NaN, line: 'bg-gold', text: 'text-gold-soft' },
    // 去泡沫只画一条灰虚线，**标尺上不挂文字**：它常与「理论安全边际」只差 1–2%
    // （茅台 979.70 与 1001.82），两行交错也必然叠字。数值放到下面的指标格里。
    { label: '', v: dbTarget ?? NaN, line: 'bg-mist-300', text: 'text-mist-300', dash: true },
    { label: '现价', v: price, line: 'bg-up', text: 'text-up' },
  ].filter((m) => Number.isFinite(m.v) && m.v > 0)

  const aboveHigh = price > hi
  const belowLow = price < lo
  const bandW = pos(hi) - pos(lo)

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="serif text-[16px] text-mist-100">估值区间</h2>
        <button
          type="button"
          onClick={() => void runDebubble()}
          disabled={!canDb || dbLoading}
          title={
            !canDb
              ? (row.channel?.debubble?.reason ?? '该样本不支持去泡沫计算')
              : dbTarget
                ? '移除去泡沫计算值'
                : '按「近 3 年 + 剔除最高 10%」重算历史通道，只多一个公平价（按需计算，不影响首屏）'
          }
          className={cn(
            'ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11.5px] transition',
            !canDb || dbLoading
              ? 'cursor-not-allowed border-ink-800 text-mist-700'
              : dbTarget
                ? 'border-gold/50 bg-gold/10 text-gold-soft hover:bg-gold/15'
                : 'border-ink-700 text-mist-400 hover:border-gold/40 hover:text-gold-soft',
          )}
        >
          {dbLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
          {dbLoading ? '计算中…' : dbTarget ? '取消去泡沫' : '去泡沫计算'}
        </button>
      </div>
      <p className="mb-3 text-[11.5px] text-mist-700">
        色带为合理区间；<span className="text-down">绿线理论安全边际</span> ·
        <span className="text-gold-soft"> 金线公平价</span> ·
        <span className="text-up"> 红线现价</span>
        {dbTarget ? <span className="text-mist-300"> · 灰虚线去泡沫计算值</span> : null}
      </p>

      <div className="relative mx-1 h-[96px] select-none">
        {/* 轴基线 */}
        <div className="absolute inset-x-0 top-[44px] h-px bg-ink-600" />
        {/* 合理区间色带。带内不放文字：公平价竖线常穿带而过（招行 48.11 正在带中），
            文字既被遮挡、白天模式对比度也不足；区间含义由卡片顶部说明承担。 */}
        <div
          className="absolute top-[38px] h-[13px] rounded-sm border border-gold/40 bg-gold/15"
          style={{ left: `${pos(lo)}%`, width: `${bandW}%` }}
        />
        {/* 参考线：数值标签交错两行，避免相邻价位文字重叠 */}
        {marks.map((m, i) => (
          <div key={`${m.label}-${i}`} className="absolute top-0 h-full" style={{ left: `${pos(m.v)}%` }}>
            <div
              className={cn(
                'absolute left-0 top-[28px] w-[1.5px] -translate-x-1/2',
                m.line,
                m.dash ? 'opacity-75' : '',
              )}
              style={{ height: 32 }}
            />
            {m.label ? (
              <div
                className="absolute left-0 -translate-x-1/2 whitespace-nowrap text-center"
                style={{ top: i % 2 === 0 ? 66 : 82 }}
              >
                <span className={cn('serif block text-[11.5px] leading-tight', m.text)}>
                  {fmtNum(m.v)}
                </span>
                <span className="block text-[9.5px] leading-tight text-mist-700">{m.label}</span>
              </div>
            ) : null}
          </div>
        ))}
        {/* 轴两端锚点：给出价格范围感，避免浮空 */}
        <span className="absolute -bottom-1 left-0 text-[10px] text-mist-700">{fmtNum(min, 1)}</span>
        <span className="absolute -bottom-1 right-0 text-[10px] text-mist-700">{fmtNum(max, 1)}</span>
      </div>

      {dbErr ? (
        <p className="mt-2 rounded-lg border border-down/30 bg-down/5 px-3 py-2 text-[11.5px] text-down">
          {dbErr}
        </p>
      ) : null}

      {/* 去泡沫只加「一个值」：不加区间、买点、E(R)、判定——那些仍以主口径为准 */}
      <dl
        className={cn(
          'mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-ink-800 pt-3 text-[12.5px]',
          dbTarget ? 'md:grid-cols-5' : 'md:grid-cols-4',
        )}
      >
        {[
          { k: '合理区间', v: `${fmtNum(lo)} – ${fmtNum(hi)}`, tone: 'text-mist-100' },
          { k: '公平价', v: fmtNum(target), tone: 'text-gold-soft' },
          { k: '理论安全边际', v: fmtNum(buy), tone: 'text-down' },
          {
            k: aboveHigh ? '现价（高于上沿）' : belowLow ? '现价（低于下沿）' : '现价（区间内）',
            v: fmtNum(price),
            tone: aboveHigh ? 'text-up' : belowLow ? 'text-down' : 'text-mist-100',
          },
          ...(dbTarget
            ? [{ k: '去泡沫公平价', v: fmtNum(dbTarget), tone: 'text-mist-300' }]
            : []),
        ].map((x) => (
          <div key={x.k} className="flex items-baseline justify-between gap-2 md:block">
            <dt className="text-[11.5px] text-mist-700">{x.k}</dt>
            <dd className={cn('serif text-[15px]', x.tone)}>{x.v}</dd>
          </div>
        ))}
      </dl>

      {row.e_return !== null && row.e_return !== undefined ? (
        <p className="mt-3 border-t border-ink-800 pt-2.5 text-[12px] text-mist-500">
          三情景期望收益{' '}
          <span className={cn('serif text-[14px]', row.e_return >= 0 ? 'text-up' : 'text-down')}>
            {fmtPct(row.e_return)}
          </span>
          （要求回报 {fmtPct(row.r, 2)}，行情 {row.market_state ?? '—'}）
        </p>
      ) : null}
    </Card>
  )
}

/* ---------------- 结果视图 ---------------- */

export function ValuationResultView({ row }: { row: StockValuationRow }) {
  const gate = row.gate
  const trend = row.trend
  const trendMeta = trend?.state ? TREND_LABELS[trend.state] : null

  return (
<div className="grid gap-4 lg:grid-cols-3">
  {/* 左列：估值区间 + 趋势与对照 */}
  <div className="space-y-4 lg:col-span-2">
    <RangeRuler row={row} />

    <Card>
      <h2 className="serif mb-3 text-[16px] text-mist-100">趋势拐点与模型对照</h2>
      <div className="space-y-3 text-[12.5px] leading-relaxed text-mist-400">
        {trendMeta ? (
          <p>
            <span className={cn('mr-2 inline-block rounded-lg border px-2 py-0.5 text-[11.5px]', trendMeta.tone)}>
              {trendMeta.label}
            </span>
            {trend?.L !== null && trend?.L !== undefined && trend?.S !== null && trend?.S !== undefined
              ? `长期 ${fmtPct(trend.L)} / 短期 ${fmtPct(trend.S)}　·　`
              : ''}
            {trend?.note ?? ''}
            {trend?.rebound &&
            (trend.state === 'inflection' || trend.state === 'stagnant' || trend.state === 'collapse')
              ? '（最新一期已止跌）'
              : ''}
          </p>
        ) : (
          <p className="text-mist-700">暂无趋势判定数据</p>
        )}

        {row.rim && typeof row.rim === 'object' && 'applicable' in row.rim ? (
          <p className="border-t border-ink-800 pt-2.5">
            <span className="text-mist-300">RIM 对照：</span>
            {(row.rim as { applicable: boolean }).applicable
              ? `隐含 PE ${fmtNum((row.rim as { pe_implied?: number }).pe_implied)}×，合理价 ${fmtNum((row.rim as { value_mix?: number }).value_mix)} 元（不参与定价，仅作交叉验证）`
              : `不适用（${(row.rim as { reason?: string }).reason ?? '—'}）`}
          </p>
        ) : null}

        {row.ev_ebitda && typeof row.ev_ebitda === 'object' && 'applicable' in row.ev_ebitda ? (
          <p className="border-t border-ink-800 pt-2.5">
            <span className="text-mist-300">EV/EBITDA：</span>
            {(row.ev_ebitda as { applicable: boolean }).applicable
              ? `EBITDA(TTM) ${fmtNum(((row.ev_ebitda as { ebitda?: number }).ebitda ?? 0) / 1e8, 1)} 亿 × ${fmtNum((row.ev_ebitda as { mult?: number }).mult, 1)}×，${(row.ev_ebitda as { mult_note?: string }).mult_note ?? ''}`
              : `不适用（${(row.ev_ebitda as { reason?: string }).reason ?? '—'}）`}
          </p>
        ) : null}

        {row.primary_model === 'EV/EBITDA' ? (
          <p className="rounded-lg border border-gold/25 bg-gold/5 px-3 py-2 text-[12px] text-gold-soft">
            本样本因 PE 口径失效（微利 + 重资产）降级为 EV/EBITDA 主模型。行业倍数为人工标定，
            结论方向可靠、幅度不宜精读。
          </p>
        ) : null}
      </div>
    </Card>

    {/* 历史通道放在趋势卡下方：两者都是「解释公平价从哪来」的前置信息 */}
    <ValuationHistoryCard row={row} />
  </div>

  {/* 右列：六维 + 排雷 + 模型参数 */}
  <div className="space-y-4">
    <Card>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="serif text-[16px] text-mist-100">六维评价</h2>
        {row.score_total !== null && row.score_total !== undefined ? (
          <p className="leading-none">
            <span className="serif text-[30px] text-mist-100">
              {row.score_total.toFixed(1)}
            </span>
            <span
              className={cn(
                'ml-1.5 rounded px-1.5 py-0.5 text-[12px]',
                row.grade === 'A'
                  ? 'bg-up/10 text-up'
                  : row.grade === 'B'
                    ? 'bg-gold/10 text-gold-soft'
                    : row.grade === 'C'
                      ? 'bg-ink-850 text-mist-400'
                      : 'bg-down/10 text-down',
              )}
            >
              {row.grade ?? '—'}
            </span>
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        {Object.entries(DIM_LABELS).map(([key, label]) => {
          const w = clampScore(row.dims?.[key])
          return (
            <div key={key} className="flex items-center gap-2.5">
              <span className="w-10 shrink-0 text-[12px] text-mist-500">{label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-850">
                <div className={cn('h-full rounded-full', barTone(w))} style={{ width: `${w ?? 0}%` }} />
              </div>
              <span className="serif w-11 shrink-0 text-right text-[12.5px] text-mist-300">
                {w === null ? '—' : w.toFixed(1)}
              </span>
            </div>
          )
        })}
        {!row.dims ? <p className="text-[12.5px] text-mist-700">该样本未进入六维评价阶段</p> : null}
      </div>
      {row.dims ? (
        <Link
          to={`/member/valuation/${row.code}/dims`}
          className="mt-3 flex items-center justify-center gap-1 rounded-lg border border-ink-700 bg-ink-850/60 py-2 text-[12px] text-mist-400 transition hover:border-gold/40 hover:text-gold-soft"
        >
          查看六维明细 <ArrowRight size={12} />
        </Link>
      ) : null}
    </Card>

    <Card>
      <h2 className="serif mb-3 flex items-center gap-1.5 text-[16px] text-mist-100">
        <ShieldAlert size={15} className="text-gold" />
        L1 排雷
      </h2>
      {gate ? (
        <>
          <p
            className={cn(
              'mb-2.5 inline-block rounded-lg border px-2 py-0.5 text-[12px]',
              gate.risk_level === '高危'
                ? 'border-down/40 bg-down/10 text-down'
                : gate.risk_level === '不通过'
                  ? 'border-down/50 bg-down/10 text-down'
                  : gate.risk_level === '关注'
                    ? 'border-gold/40 text-gold-soft'
                    : 'border-ink-600 text-mist-400',
            )}
          >
            风险等级：{gate.risk_level}
          </p>
          <ul className="space-y-1.5 text-[12.5px] leading-relaxed">
            {gate.hard.map((x) => (
              <li key={x} className="flex gap-1.5 text-down">
                <span className="shrink-0">✕</span>
                <span>{x}</span>
              </li>
            ))}
            {gate.soft.map((x) => (
              <li key={x} className="flex gap-1.5 text-mist-400">
                <span className="shrink-0 text-gold">△</span>
                <span>{x}</span>
              </li>
            ))}
            {gate.hard.length === 0 && gate.soft.length === 0 ? (
              <li className="text-mist-700">未命中任何排雷项</li>
            ) : null}
          </ul>
        </>
      ) : (
        <p className="text-[12.5px] text-mist-700">暂无排雷数据</p>
      )}
    </Card>

    <Card>
      <h2 className="serif mb-3 text-[16px] text-mist-100">模型参数</h2>
      <dl className="space-y-1.5 text-[12.5px]">
        {[
          { k: '主模型', v: row.primary_model ?? '—' },
          { k: '要求回报 r', v: fmtPct(row.r, 2) },
          { k: '永续增长 g', v: fmtPct(row.g, 2) },
          { k: '分红率 b', v: bLabel(row) },
        ].map((x) => (
          <div key={x.k} className="flex justify-between">
            <dt className="text-mist-500">{x.k}</dt>
            <dd className="text-mist-200">{x.v}</dd>
          </div>
        ))}
      </dl>
      {row.caveat ? (
        <p className="mt-2.5 rounded-lg border border-ink-700 bg-ink-850/60 px-3 py-2 text-[11.5px] leading-relaxed text-mist-500">
          {row.caveat}
        </p>
      ) : null}
      <p className="mt-2.5 flex items-center gap-1 text-[11px] text-mist-700">
        {row.e_return !== null && row.e_return !== undefined && row.e_return >= 0 ? (
          <TrendingUp size={11} className="text-up" />
        ) : (
          <TrendingDown size={11} className="text-down" />
        )}
        数据更新于 {(row.updated_at ?? '').slice(0, 10)}
      </p>
    </Card>
  </div>
</div>
  )
}
