/**
 * ── 文件：src/components/ThermometerCard.tsx ────────────────────
 * 功能：首页 A 股温度计卡片：0-100 读数、分区文案、近一年温度曲线（ECharts）。
 * 数据：market_temp 表（listMarketTemp），字段 series 里放着历史点。
 * 改动指引：
 *   1. 改分区阈值 / 文案 → lib/thermo.ts 的 ZONES（此处只消费，不重复定义）；
 *   2. 改曲线区间 → TempHoverChart 里的数据切片；
 *   3. 改卡片布局 → ThermometerCard 的 grid 分区。
 * 注意：ECharts 不认 CSS 变量，颜色必须经 resolveCssVar 解析成具体色值。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Lock, Thermometer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { echarts, type EChartsOption } from '../lib/echarts'
import { Card } from './PageHeader'
import { useTheme } from '../context/ThemeContext'
import { DEFAULT_PERIOD, PERIOD_OPTIONS, filterByPeriod, type PeriodKey } from '../lib/period'
import { useCachedResource } from '../lib/useCachedResource'
import { cacheKey } from '../services/cache'
import { isMasterValid, isMemberValid, useAuth } from '../context/AuthContext'
import { FACTOR_META, resolveCssVar, seriesOf, zoneOf } from '../lib/thermo'
import { listMarketTempHistory } from '../services/content'
import type { MarketTempRow } from '../lib/types'
import { cn } from '../lib/utils'

/**
 * A股温度计卡片（2026-10-20 起挂在「A股市场数据」页 /member/market 顶部，原在首页）。
 *
 * 7 个市场情绪因子等权百分位合成 0-100 温度：
 * 0-20 极度恐慌 / 20-40 恐慌 / 40-60 中性 / 60-80 贪婪 / 80-100 极度贪婪。
 * 视觉参考 xindahuatai.cn 温度计（不含近 30 日明细表）；数据由
 * scripts/thermo-fetch.sh + scripts/thermo.mjs 复算后写入云库 market_temp，
 * 与市场数据 PE 由同一个定时任务在每交易日收盘后更新。每个因子可点击进入各自的历史走势页；
 * 近一年温度曲线支持鼠标悬停查看对应日期的数值。
 */

const clamp100 = (v: number) => Math.max(0, Math.min(100, v))

/** ECharts 紧凑折线：坐标轴隐藏、仅保留参考网格线，悬停显示日期与温度 */
function TempHoverChart({ points, isLight }: { points: Array<[string, number]>; isLight: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  const option = useMemo<EChartsOption | null>(() => {
    if (points.length < 2) return null
    const gold = resolveCssVar('var(--color-gold)')
    const splitLine = isLight ? '#e7ecf3' : '#182231'
    const pointer = isLight ? '#b9c6d6' : '#3a4a5e'
    return {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: pointer, type: 'dashed' } },
        valueFormatter: (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(1)}°`),
      },
      grid: { left: 10, right: 12, top: 10, bottom: 6, containLabel: false },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: points.map((p) => p[0]),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { interval: 20, lineStyle: { color: splitLine, type: 'dashed' } },
      },
      series: [
        {
          name: '温度',
          type: 'line',
          data: points.map((p) => p[1]),
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 1.6, color: gold },
          itemStyle: { color: gold },
          areaStyle: { color: gold, opacity: 0.07 },
        },
      ],
    } as EChartsOption
  }, [points, isLight])

  useEffect(() => {
    if (!ref.current || !option) return
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' })
    chart.setOption(option)
    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chart.dispose()
    }
  }, [option])

  if (!option) return null
  return <div ref={ref} style={{ height: 110 }} className="w-full" />
}

/** 温度计卡片：读数、分区文案、近一年温度曲线。 */
export function ThermometerCard({ data, loading }: { data: MarketTempRow | null; loading: boolean }) {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'
  /** 温度走势时间段（默认近一年） */
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD)

  // 注意：hooks 必须在任何条件 return 之前调用
  /** 全部温度曲线点（约近一年 250 个交易日） */
  const allPoints = useMemo<Array<[string, number]>>(() => {
    const s = seriesOf(data)
    if (!s) return []
    return s.dates
      .map((d, i) => [d, s.temperature[i]] as [string, number])
      .filter((p) => Number.isFinite(p[1]))
  }, [data])

  /** 可选时段（历史明细表自 2018-11-08 起，全部选项都可用） */
  const periodChoices = PERIOD_OPTIONS

  /** 近 3 年 / 全部需要完整历史（快照里的 series 只有近一年） */
  const needsFull = period === '3y' || period === 'all'
  const histRes = useCachedResource(
    needsFull ? cacheKey('temp:history') : null,
    useCallback(() => listMarketTempHistory(), []),
  )

  /** 曲线数据源：长时段用全量明细表，其余用随快照加载的近一年 series */
  const sourcePoints = useMemo<Array<[string, number]>>(() => {
    if (needsFull) {
      return (histRes.data ?? []).map((r) => [r.trade_date, Number(r.temperature)] as [string, number])
    }
    return allPoints
  }, [needsFull, histRes.data, allPoints])

  /** 按所选时间段过滤后的曲线点 */
  const points = useMemo(() => filterByPeriod(sourcePoints, (p) => p[0], period), [sourcePoints, period])
  /** 长时段首次加载时的占位 */
  const chartLoading = needsFull && histRes.loading && !histRes.data

  if (loading) {
    return <div className="skeleton h-64 rounded-2xl" />
  }

  if (!data) {
    return (
      <Card className="border-dashed">
        <p className="flex items-center gap-2 text-[11.5px] tracking-[0.18em] text-gold-soft">
          <Thermometer size={14} />
          A 股温度计 · 复盘参考
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-mist-700">
          温度数据待更新：复算完成后将展示最新市场温度、7 因子分解与近一年走势。
        </p>
      </Card>
    )
  }

  const temp = Number(data.temperature)
  const zone = zoneOf(temp)
  /**
   * 明细可见性：7 因子分解与温度走势属学员专属内容，仅学员/高级学员/管理员可见；
   * 无权益用户只展示温度大字（含状态与分位）。
   */
  const canSeeDetail = Boolean(user && (user.isAdmin || isMemberValid(user) || isMasterValid(user)))
  const pct = data.pct_rank === null || data.pct_rank === undefined ? null : Number(data.pct_rank)
  const factors = data.factors ?? {}
  const stats = data.stats ?? {}
  const prev =
    data.prev_temperature === null || data.prev_temperature === undefined
      ? null
      : Number(data.prev_temperature)
  const delta = prev === null ? null : temp - prev

  const barGradient =
    'linear-gradient(90deg,' +
    ' var(--color-down) 0%, var(--color-down) 20%,' +
    ' var(--color-jade) 20%, var(--color-jade) 40%,' +
    ' var(--color-gold) 40%, var(--color-gold) 60%,' +
    ' var(--accent-coral) 60%, var(--accent-coral) 80%,' +
    ' var(--color-up) 80%, var(--color-up) 100%)'

  return (
    <Card className="border-gold/25 bg-gradient-to-br from-gold/8 to-transparent">
      {/* 头部：标题 + 数据日期 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[11.5px] tracking-[0.18em] text-gold-soft">
          <Thermometer size={14} />
          A 股温度计 · 复盘参考
        </p>
        <p className="text-[11.5px] text-mist-700">
          数据截至 {data.as_of_date}
          {delta !== null ? (
            <>
              {' · 较前日 '}
              <span className={cn('tabular-nums', delta >= 0 ? 'text-up' : 'text-down')}>
                {delta >= 0 ? '+' : ''}
                {delta.toFixed(1)}°
              </span>
            </>
          ) : null}
        </p>
      </div>

      {/* 主数值 + 0-100 刻度 */}
      <div className="mt-3 grid gap-4 md:grid-cols-[250px_1fr] md:items-center">
        <div>
          <p className="flex items-baseline gap-2.5">
            <span
              className="text-[42px] font-semibold leading-none tabular-nums"
              style={{ color: zone.color }}
            >
              {temp.toFixed(1)}°
            </span>
            <span
              className="rounded-full border px-2.5 py-0.5 text-[12px]"
              style={{
                color: zone.color,
                borderColor: `color-mix(in srgb, ${zone.color} 40%, transparent)`,
                background: `color-mix(in srgb, ${zone.color} 12%, transparent)`,
              }}
            >
              {zone.name}
            </span>
          </p>
          <p className="mt-2 text-[11.5px] text-mist-700">
            {pct === null ? '' : `历史 ${pct.toFixed(0)}% 分位`}
            {stats.days ? ` · 统计 ${stats.days} 个交易日` : ''}
            {data.window_start ? `（${data.window_start} 起）` : ''}
          </p>
        </div>

        <div className="pb-1">
          <div className="relative h-2.5">
            <div className="absolute inset-0 rounded-full opacity-45" style={{ background: barGradient }} />
            <span
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-900"
              style={{ left: `${clamp100(temp)}%`, background: zone.color }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[10.5px] text-mist-700">
            <span>0° 极度恐慌</span>
            <span>50° 中性</span>
            <span>100° 极度贪婪</span>
          </div>
        </div>
      </div>

      {canSeeDetail ? (
        <>
      {/* 7 因子分解（可点击进入各自的历史走势页） */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {FACTOR_META.map((f) => {
          const raw = factors[f.key]
          if (raw === undefined || raw === null) return null
          const value = Number(raw)
          const z = zoneOf(value)
          return (
            <Link
              key={f.key}
              to={`/member/temp/${f.key}`}
              title={`查看${f.label}的历史走势`}
              className="group relative rounded-xl border border-ink-700 bg-ink-900/70 px-2.5 py-2 transition hover:border-gold/45 hover:bg-ink-900"
            >
              <ChevronRight
                size={12}
                className="absolute right-1.5 top-1.5 text-mist-700 opacity-0 transition group-hover:opacity-100"
              />
              <p className="truncate pr-3 text-[11px] text-mist-700">{f.label}</p>
              <p className="mt-0.5 text-[15px] font-semibold tabular-nums" style={{ color: z.color }}>
                {value.toFixed(1)}
              </p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-750">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${clamp100(value)}%`, background: z.color }}
                />
              </div>
            </Link>
          )
        })}
      </div>

      {/* 温度曲线（鼠标悬停显示对应日期与数值） */}
      {points.length > 1 || chartLoading ? (
        <div className="mt-4 rounded-xl border border-ink-700 bg-ink-900/60 p-3">
          <p className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-mist-700">
            <span>
              温度走势
              <span className="ml-2 text-mist-700/80">悬停查看对应日期数值</span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              <select
                className="field w-auto cursor-pointer px-2 py-0.5 text-[11.5px]"
                value={period}
                onChange={(e) => setPeriod(e.target.value as PeriodKey)}
              >
                {periodChoices.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="tabular-nums">
                {points.length ? `${points[0][0]} ~ ${points[points.length - 1][0]}` : '加载中…'}
              </span>
            </span>
          </p>
          {chartLoading ? (
            <div className="skeleton h-[110px] rounded-lg" />
          ) : (
            <TempHoverChart points={points} isLight={isLight} />
          )}
        </div>
      ) : null}

      {/* 历史统计 */}
      {stats.days ? (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-mist-500">
          <span>
            历史最低 <b className="tabular-nums text-down">{Number(stats.min).toFixed(1)}°</b>
          </span>
          <span>
            历史最高 <b className="tabular-nums text-up">{Number(stats.max).toFixed(1)}°</b>
          </span>
          <span>
            中位数 <b className="tabular-nums text-mist-100">{Number(stats.median).toFixed(1)}°</b>
          </span>
          <span>
            平均值 <b className="tabular-nums text-mist-100">{Number(stats.mean).toFixed(1)}°</b>
          </span>
          <span>
            标准差 <b className="tabular-nums text-mist-100">±{Number(stats.std).toFixed(1)}°</b>
          </span>
        </div>
      ) : null}
        </>
      ) : (
        /* 无学员权益：仅展示温度大字，7 因子 / 走势图 / 历史统计为学员专属数据 */
        <div className="mt-4 rounded-xl border border-dashed border-gold/30 bg-gold/[0.04] p-4 text-center">
          <p className="flex items-center justify-center gap-1.5 text-[12.5px] text-gold-soft">
            <Lock size={13} />
            7 因子分解与温度走势为学员专属
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-700">
            开通学员权益后，可查看每日七大因子（市场动量 / 成交活跃度 / 波动率 / 风险偏好 / 大小盘风格 /
            赚钱效应 / 融资融券）的独立数值，以及近一年、近三年乃至全部历史的温度走势与分位统计。
          </p>
          <Link to="/member/profile" className="btn btn-primary mt-3">
            查看我的权益
          </Link>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-mist-700">
        温度由 7 个市场情绪因子（市场动量 / 成交活跃度 / 波动率反向 / 风险偏好 / 大小盘风格 / 赚钱效应 /
        融资融券）各自标准化为 0-100 历史百分位后等权合成：温度越低越恐慌，越高越贪婪。
        点击任一因子可查看其独立历史走势。为客观统计与复盘参考，不预测涨跌，不构成投资建议。
      </p>
    </Card>
  )
}
