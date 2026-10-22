import { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from './PageHeader'
import { echarts, type EChartsOption } from '../lib/echarts'
import { paletteOf } from '../lib/chartPalette'
import { useTheme } from '../context/ThemeContext'
import {
  availablePeriods,
  filterByPeriod,
  periodBounds,
  type PeriodKey,
} from '../lib/period'
import type { StockValuationChannel, StockValuationRow, StockValuationSeriesPoint } from '../lib/types'

/**
 * 历史估值（2026-10-22 第二版）
 *
 * 交互对齐「A股市场数据」模块的历史 PE 走势图——同一套 ECharts 配置与时间段工具：
 *   · 十字线随鼠标移动，实时显示该日估值；
 *   · 时间段可切换（近 1 个月 / 3 个月 / 1 年 / 3 年 / 全部），复用 `lib/period`；
 *   · **图中标出最低估值**（markPoint + 水平参考线）——这是本卡与市场页唯一的差别：
 *     市场页把极值放在表格里，这里要让用户一眼看到「历史最便宜到过多少」。
 *
 * 两个刻意的取舍
 *   1. **走势而不是分位**：P20/P50/P80 是统计摘要，看不出「什么时候贵」。
 *      判断「现在便不便宜」的参照物是历史低点，所以图上标最低、卡头报最低。
 *   2. **全量点位 + sampling 绘制**：后端给完整序列（约 1210 点），切到「近 1 个月」
 *      也有足够密度；渲染时用 ECharts 的 lttb 采样，不影响性能。
 */

function fmt(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(digits)
}

/** 'YYYY-MM-DD' → 时间戳（本地零点，仅用于 time 轴定位与 tooltip 回显） */
function tsOf(d: string): number {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, (m || 1) - 1, day || 1).getTime()
}

function fmtDay(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** time 轴的日期格式随跨度变化，否则短窗口清一色「10-25」看不出年份 */
function axisFormatter(spanMs: number) {
  if (spanMs <= 40 * 864e5) return (v: number) => fmtDay(v).slice(5)
  if (spanMs <= 200 * 864e5) return (v: number) => fmtDay(v).slice(2, 7)
  return (v: number) => fmtDay(v).slice(0, 7)
}

function HistoryTrendChart({
  points,
  low,
  isPB,
  isLight,
}: {
  points: StockValuationSeriesPoint[]
  low: StockValuationSeriesPoint | null
  isPB: boolean
  isLight: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const pal = paletteOf(isLight)
  const unit = isPB ? 'PB' : 'PE'
  const lineColor = isLight ? '#5d6b7d' : '#9fb0c4'

  const option = useMemo<EChartsOption | null>(() => {
    if (points.length < 2) return null
    const data: Array<[number, number]> = points.map((p) => [tsOf(p.d), p.v])
    const span = data[data.length - 1][0] - data[0][0]

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        // 十字线随鼠标移动，实时显示该日估值（与市场数据模块一致）
        axisPointer: { type: 'cross', label: { fontSize: 10 } },
        formatter: (params: unknown) => {
          const arr = params as Array<{ axisValue?: number; value?: unknown }>
          const first = arr?.[0]
          if (!first) return ''
          const raw = Array.isArray(first.value) ? first.value[1] : first.value
          const v = Number(raw)
          const ts = Number(first.axisValue)
          return `${Number.isFinite(ts) ? fmtDay(ts) : ''}<br/>${unit} ${Number.isFinite(v) ? v.toFixed(2) : '—'}`
        },
      },
      grid: { left: 52, right: 18, top: 18, bottom: 28 },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: pal.axisLine } },
        axisLabel: { color: pal.axisLabel, fontSize: 10, hideOverlap: true, formatter: axisFormatter(span) },
        axisPointer: { label: { fontSize: 10 } },
      },
      yAxis: {
        type: 'value',
        name: isPB ? 'PB-MRQ' : 'PE-TTM',
        nameTextStyle: { color: pal.axisLabel, fontSize: 10, align: 'left' },
        axisLine: { lineStyle: { color: pal.axisLine } },
        axisLabel: { color: pal.axisLabel, fontSize: 10 },
        splitLine: { lineStyle: { color: pal.splitLine } },
        scale: true,
        // 关掉 y 轴上的十字线数值：它跟随鼠标位置（34.52），而 tooltip 显示的是当日实际值（25.05），
        // 两个数同时出现会被误读成「数据不一致」
        axisPointer: { label: { show: false } },
      },
      series: [
        {
          type: 'line',
          data,
          smooth: true,
          // 点密时不画 symbol，靠十字线读值；最低点单独用 markPoint 标出
          showSymbol: false,
          // 1210 点全画会拖慢渲染，lttb 采样保留形状与极值
          sampling: 'lttb',
          lineStyle: { width: 1.6, color: lineColor },
          itemStyle: { color: lineColor },
          // 最低点：pin + 水平虚线，让人一眼看出「其余时间都在它之上」
          markPoint: low
            ? {
                // 圆点 + 侧边标签：pin 的宽度放不下「最低 17.66」，会被挤成「低 17」
                symbol: 'circle',
                symbolSize: 8,
                itemStyle: { color: '#d8ab4a', borderColor: isLight ? '#ffffff' : '#0b1220', borderWidth: 1.5 },
                label: {
                  formatter: `最低 ${low.v.toFixed(2)}`,
                  fontSize: 9.5,
                  color: isLight ? '#8a6a1f' : '#f0cd82',
                  // 最低点常落在右端，那里没有空间了就把标签翻到左边
                  position: (tsOf(low.d) - data[0][0]) / (span || 1) > 0.82 ? 'left' : 'right',
                  distance: 5,
                },
                data: [{ coord: [tsOf(low.d), low.v] }],
              }
            : undefined,
          markLine: low
            ? {
                silent: true,
                symbol: 'none',
                lineStyle: { type: 'dashed', width: 1, color: 'rgba(216,171,74,0.5)' },
                label: {
                  formatter: `${unit} ${low.v.toFixed(2)}`,
                  fontSize: 9,
                  color: pal.axisLabel,
                  // 放左端：最低点的标签常在右端，两个数贴在一起会糊
                  position: 'insideStartTop',
                },
                data: [{ yAxis: low.v }],
              }
            : undefined,
        },
      ],
    } as EChartsOption
  }, [points, low, isPB, isLight, pal, lineColor, unit])

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
    return <p className="py-6 text-center text-[12px] text-mist-700">该区间数据点不足，暂无法绘制走势</p>
  }
  return <div ref={ref} data-history-chart style={{ height: 210 }} className="w-full" />
}

export function ValuationHistoryCard({ row }: { row: StockValuationRow }) {
  const ch: StockValuationChannel | null | undefined = row.channel
  // 云库历史样本没有该字段；EV/EBITDA、回避类模型没有通道——都不渲染
  if (!ch || !ch.applicable) return null
  const all = ch.series?.points ?? []
  if (all.length < 2) return null
  return <HistoryBody row={row} ch={ch} all={all} />
}

/** 状态（时间段）要放在 hooks 里：上面的早退不能夹在 hooks 之间 */
function HistoryBody({
  row,
  ch,
  all,
}: {
  row: StockValuationRow
  ch: StockValuationChannel
  all: StockValuationSeriesPoint[]
}) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  // 后端只给 5 年窗口，默认看全部；用户可切更短
  const [period, setPeriod] = useState<PeriodKey>('all')

  const isPB = ch.model === 'PB'
  const unit = isPB ? 'PB' : 'PE'
  const current = ch.current ?? null

  // 可选时段按数据实际跨度裁剪：只有一年数据时不该出现「近 3 年」
  const opts = useMemo(() => availablePeriods(all.map((p) => p.d)), [all])
  const visible = useMemo(() => filterByPeriod(all, (p) => p.d, period), [all, period])
  const bounds = useMemo(() => periodBounds(visible, (p) => p.d), [visible])
  // 图中标注的是**所选区间内**的最低点：切到近 1 年就该看这一年的低点
  const low = useMemo(
    () => (visible.length ? visible.reduce((a, b) => (b.v < a.v ? b : a)) : null),
    [visible],
  )
  const wholeLow = ch.series?.low ?? null

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="serif text-[16px] text-mist-100">历史估值</h2>
        <span className="rounded bg-ink-850 px-1.5 py-0.5 text-[10.5px] text-mist-500">
          {isPB ? 'PB-MRQ' : 'PE-TTM'}
        </span>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodKey)}
          aria-label="历史估值时间范围"
          className="ml-auto rounded-md border border-ink-700 bg-ink-850 px-2 py-1 text-[11px] text-mist-300 outline-none transition hover:border-gold/40"
        >
          {opts.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <p className="mb-2 text-[11.5px] leading-relaxed text-mist-700">
        <span className="whitespace-nowrap">
          当前 {unit} <span className="serif text-mist-300">{fmt(current)}</span>
          （历史 {fmt((ch.cur_pct ?? 0) * 100, 0)}% 分位）
        </span>
        {' · '}
        <span className="whitespace-nowrap">
          近 {ch.window_years ?? 5} 年最低 <span className="serif text-gold-soft">{fmt(wholeLow?.v)}</span>
          {wholeLow?.d ? `（${wholeLow.d}）` : ''}
        </span>
      </p>

      <HistoryTrendChart points={visible} low={low} isPB={isPB} isLight={isLight} />

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-[10px] text-mist-700">
        <span data-history-bounds>
          {bounds ? `${bounds[0]} ~ ${bounds[1]}` : '—'} · {visible.length} 个交易日
        </span>
        <span className="text-gold-soft" data-history-low>
          图中最低 {fmt(low?.v)}
          {low?.d ? `（${low.d}）` : ''}
        </span>
      </div>
    </Card>
  )
}
