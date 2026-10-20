/**
 * ── 文件：src/pages/TempFactorPage.tsx ──────────────────────────
 * 功能：温度计因子详情：7 个因子 Tab，每个因子一条历史曲线 + 当前分位 + 区间底色。
 * 数据：market_temp（当日）、market_temp_history（历史序列）。
 * 改动指引：
 *   1. 改区间底色 → ZONE_BANDS；
 *   2. 改坐标轴 / 网格 → CHART_AXIS；
 *   3. 改因子文案 → lib/thermo.ts 的 FACTOR_META；
 *   4. 改默认区间 → lib/period.ts 的 DEFAULT_PERIOD。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { echarts, type EChartsOption } from '../lib/echarts'
import { ArrowLeft, Thermometer } from 'lucide-react'
import { Card, PageHeader } from '../components/PageHeader'
import { EmptyState, Spinner } from '../components/ui'
import { useTheme } from '../context/ThemeContext'
import { DEFAULT_PERIOD, PERIOD_OPTIONS, filterByPeriod, type PeriodKey } from '../lib/period'
import { useCachedResource } from '../lib/useCachedResource'
import { cacheKey } from '../services/cache'
import { FACTOR_META, resolveCssVar, seriesOf, zoneOf } from '../lib/thermo'
import type { MarketTempRow } from '../lib/types'
import { cn, readableError } from '../lib/utils'
import { listMarketTemp, listMarketTempHistory } from '../services/content'

/**
 * 单因子历史走势页（/member/temp/:factor）。
 *
 * 用 ECharts 画近一年逐日序列：鼠标沿图表移动时显示对应日期与数值
 * （axis 触发 tooltip + 十字准线），0-100 分位轴叠加五档区间底色。
 * 配色跟随日夜主题。
 */

const ZONE_BANDS = {
  dark: [
    'rgba(38, 163, 122, 0.05)',
    'rgba(78, 201, 176, 0.05)',
    'rgba(216, 171, 74, 0.05)',
    'rgba(232, 131, 107, 0.05)',
    'rgba(239, 83, 80, 0.05)',
  ],
  light: [
    'rgba(18, 138, 99, 0.06)',
    'rgba(22, 130, 109, 0.06)',
    'rgba(156, 111, 28, 0.06)',
    'rgba(201, 84, 58, 0.06)',
    'rgba(212, 59, 56, 0.06)',
  ],
}

const CHART_AXIS = {
  dark: { axisLine: '#24303f', axisLabel: '#7d8da1', splitLine: '#182231', pointer: '#3a4a5e' },
  light: { axisLine: '#d6dee9', axisLabel: '#71808f', splitLine: '#e7ecf3', pointer: '#b9c6d6' },
}

function FactorChart({
  dates,
  values,
  label,
  lineColor,
  isLight,
}: {
  dates: string[]
  values: number[]
  label: string
  lineColor: string
  isLight: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  const option = useMemo<EChartsOption | null>(() => {
    if (dates.length < 2 || values.length < 2) return null
    const axis = isLight ? CHART_AXIS.light : CHART_AXIS.dark
    const bands = isLight ? ZONE_BANDS.light : ZONE_BANDS.dark
    const color = resolveCssVar(lineColor)
    const last = values[values.length - 1]
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          crossStyle: { color: axis.pointer, type: 'dashed' },
          label: { backgroundColor: axis.axisLine, color: axis.axisLabel },
        },
        valueFormatter: (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(1)),
      },
      grid: { left: 48, right: 24, top: 20, bottom: 40 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLine: { lineStyle: { color: axis.axisLine } },
        axisLabel: { color: axis.axisLabel, fontSize: 11, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        name: '分位',
        nameTextStyle: { color: axis.axisLabel, fontSize: 11 },
        axisLine: { show: false },
        axisLabel: { color: axis.axisLabel, fontSize: 11 },
        splitLine: { lineStyle: { color: axis.splitLine } },
      },
      series: [
        {
          name: label,
          type: 'line',
          data: values,
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, color },
          itemStyle: { color },
          areaStyle: { color, opacity: 0.08 },
          markArea: {
            silent: true,
            data: [
              [{ yAxis: 0, itemStyle: { color: bands[0] } }, { yAxis: 20 }],
              [{ yAxis: 20, itemStyle: { color: bands[1] } }, { yAxis: 40 }],
              [{ yAxis: 40, itemStyle: { color: bands[2] } }, { yAxis: 60 }],
              [{ yAxis: 60, itemStyle: { color: bands[3] } }, { yAxis: 80 }],
              [{ yAxis: 80, itemStyle: { color: bands[4] } }, { yAxis: 100 }],
            ],
          },
          markLine: {
            silent: true,
            symbol: 'none',
            label: {
              formatter: `最新 ${Number(last).toFixed(1)}`,
              color: axis.axisLabel,
              fontSize: 11,
              position: 'insideEndTop',
            },
            lineStyle: { color, type: 'dashed', width: 1 },
            data: [{ yAxis: Number(last) }],
          },
        },
      ],
    } as EChartsOption
  }, [dates, values, label, lineColor, isLight])

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

  if (!option) {
    return <p className="py-10 text-center text-[12.5px] text-mist-700">数据点不足，暂无法绘制走势</p>
  }
  return <div ref={ref} style={{ height: 380 }} className="mt-3 w-full" />
}

/** 温度计因子详情：7 因子 Tab + 历史曲线。 */
export function TempFactorPage() {
  const { factor = '' } = useParams()
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const meta = FACTOR_META.find((f) => f.key === factor) ?? null

  const [data, setData] = useState<MarketTempRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /** 走势图时间段（默认近一年） */
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD)

  const load = useCallback(async () => {
    try {
      setData(await listMarketTemp())
    } catch (err) {
      setError(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const series = seriesOf(data)
  const allValues = meta && series ? series.factors[meta.key] ?? [] : []
  const allDates = series?.dates ?? []

  /** 可选时段：历史明细表自 2018-11-08 起，全部选项都可用 */
  const periodChoices = PERIOD_OPTIONS

  /** 近 3 年 / 全部需要完整历史（快照里的 series 只保留近一年） */
  const needsFull = period === '3y' || period === 'all'
  const histRes = useCachedResource(
    needsFull ? cacheKey('temp:history') : null,
    useCallback(() => listMarketTempHistory(), []),
  )

  /** 按所选时间段过滤后的日期/数值序列（长时段走明细表，按因子 key 取对应列） */
  const view = useMemo(() => {
    const key = meta?.key ?? ''
    const pairs =
      needsFull && histRes.data
        ? histRes.data.map((r) => ({
            d: r.trade_date,
            v: Number((r as unknown as Record<string, unknown>)[key]),
          }))
        : allDates.map((d, i) => ({ d, v: allValues[i] }))
    const valid = pairs.filter((p) => Number.isFinite(p.v))
    const sliced = filterByPeriod(valid, (p) => p.d, period)
    return { dates: sliced.map((p) => p.d), values: sliced.map((p) => p.v) }
  }, [needsFull, histRes.data, allDates, allValues, period, meta])

  /** 长时段首次加载时的占位 */
  const chartLoading = needsFull && histRes.loading && !histRes.data

  const values = view.values
  const dates = view.dates

  const latest = values.length ? values[values.length - 1] : null
  const zone = latest === null ? null : zoneOf(latest)
  const min = values.length ? Math.min(...values) : null
  const max = values.length ? Math.max(...values) : null
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null

  if (!meta) {
    return (
      <EmptyState
        title="未知的因子"
        desc="请从「A股市场数据」页顶部的温度计因子格子进入对应的历史走势页。"
        action={
          <Link to="/member/market" className="btn btn-primary">
            返回市场数据页
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Market Thermometer"
        title={meta.label}
        desc={meta.desc}
        right={
          <Link to="/member/market" className="btn btn-ghost">
            <ArrowLeft size={14} />
            返回市场数据页
          </Link>
        }
      />

      {/* 因子切换 */}
      <div className="flex flex-wrap gap-1.5">
        {FACTOR_META.map((f) => (
          <Link
            key={f.key}
            to={`/member/temp/${f.key}`}
            className={cn(
              'rounded-lg border px-2.5 py-1.5 text-[12px] transition',
              f.key === meta.key
                ? 'border-gold/50 bg-gold/10 text-gold-soft'
                : 'border-ink-700 text-mist-500 hover:border-ink-600 hover:text-mist-200',
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {loading ? (
        <div className="skeleton h-[420px] rounded-2xl" />
      ) : error ? (
        <EmptyState
          title="数据加载失败"
          desc={error}
          action={
            <button type="button" className="btn btn-ghost" onClick={() => void load()}>
              重试
            </button>
          }
        />
      ) : chartLoading ? (
        <div className="skeleton h-[420px] rounded-2xl" />
      ) : !dates.length || !values.length ? (
        <EmptyState
          title="暂无该因子的历史数据"
          desc="温度数据复算完成后将展示近一年的逐日走势。"
        />
      ) : (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11.5px] text-mist-700">
                最新值（{data?.as_of_date}）
              </p>
              <p className="mt-1 flex items-baseline gap-2.5">
                <span
                  className="text-[34px] font-semibold leading-none tabular-nums"
                  style={{ color: zone?.color }}
                >
                  {latest === null ? '—' : latest.toFixed(1)}
                </span>
                {zone ? (
                  <span
                    className="rounded-full border px-2 py-0.5 text-[11.5px]"
                    style={{
                      color: zone.color,
                      borderColor: `color-mix(in srgb, ${zone.color} 40%, transparent)`,
                      background: `color-mix(in srgb, ${zone.color} 12%, transparent)`,
                    }}
                  >
                    {zone.name}
                  </span>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-mist-500">
              <span className="flex items-center gap-1.5">
                <span>时间段</span>
                <select
                  className="field w-auto cursor-pointer px-2 py-1 text-[11.5px]"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as PeriodKey)}
                >
                  {periodChoices.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </span>
              <span>
                区间最低 <b className="tabular-nums text-down">{min === null ? '—' : min.toFixed(1)}</b>
              </span>
              <span>
                区间最高 <b className="tabular-nums text-up">{max === null ? '—' : max.toFixed(1)}</b>
              </span>
              <span>
                均值 <b className="tabular-nums text-mist-100">{avg === null ? '—' : avg.toFixed(1)}</b>
              </span>
            </div>
          </div>

          <FactorChart
            dates={dates}
            values={values}
            label={meta.label}
            lineColor={zone?.color ?? 'var(--color-gold)'}
            isLight={isLight}
          />

          <p className="mt-2 text-[11px] leading-relaxed text-mist-700">
            <Thermometer size={11} className="mr-1 inline align-[-1px]" />
            数值为该因子的 0-100 历史百分位得分（{data?.window_start ?? '2018-11'} 起统计，图中默认近一年逐日、可切换时间段）；
            鼠标在图上移动可查看对应日期的数值。背景色带为温度区间：0-20 极度恐慌、20-40 恐慌、
            40-60 中性、60-80 贪婪、80-100 极度贪婪。数据来源于东方财富公开行情，每个交易日收盘后自动更新。
          </p>
        </Card>
      )}
    </div>
  )
}
