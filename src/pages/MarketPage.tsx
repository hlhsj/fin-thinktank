import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { echarts, type EChartsOption } from '../lib/echarts'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Card, PageHeader } from '../components/PageHeader'
import { EmptyState, Spinner } from '../components/ui'
import { useTheme } from '../context/ThemeContext'
import { cn, readableError } from '../lib/utils'
import {
  DEFAULT_PERIOD,
  PERIOD_OPTIONS,
  filterByPeriod,
  periodBounds,
  shiftMonths,
  type PeriodKey,
} from '../lib/period'
import { useCachedResource } from '../lib/useCachedResource'
import { cacheKey } from '../services/cache'
import {
  listPeDataGap,
  listPeExtreme,
  listPeIndex,
  listPeIndustry,
  listPeIndustryDaily,
  type PeDataGapRow,
  type PeExtremeRow,
  type PeIndexRow,
  type PeIndustryDailyRow,
  type PeIndustryRow,
} from '../services/content'

/**
 * A 股市场数据 · 市盈率 TTM 专题
 *
 * 核心：上证指数、深证成指、创业板指、科创50 的历史 PE-TTM 走势（日频，前三只自
 *       2015-01-05、科创50 自 2020-07-23 起；2006-2009 已按要求剔除，勿加回），
 *       历史最低/最高位由前端按全量日频数据实时计算，并给出「当前分位」；走势图支持选择时间段浏览。
 * 地域/行业：同花顺地域指数 882001~882033 / 同花顺一级行业（通达信 881xxx）的当日 PE-TTM 与总市值。
 *
 * 数据口径：日频。指数来源通达信指数历史估值接口（period=1 日频），板块来源 iFinD；
 *           两个表均由每交易日收盘后定时任务自动更新（23:20，入口
 *           scripts/daily-pe-update.mjs + scripts/fetch-pe-boards.mjs --repair）。
 * 配色：color 为夜晚模式取值，colorLight 为白天模式取值（白底需整体加深）。
 */

const INDEX_META: Array<{ code: string; name: string; color: string; colorLight: string }> = [
  { code: '000001', name: '上证指数', color: '#d8ab4a', colorLight: '#a2761c' },
  { code: '399001', name: '深证成指', color: '#7aa7ff', colorLight: '#3a6fd8' },
  { code: '399006', name: '创业板指', color: '#4ec9b0', colorLight: '#16826d' },
  { code: '000688', name: '科创50', color: '#c792ea', colorLight: '#8250c8' },
]

/** ECharts 坐标系配色：按主题取。
 *  gapFill = 「数据缺失」底色；gapFillNegative = 「区间值为负数」底色（偏暖，便于区分口径问题） */
const CHART_PALETTE = {
  dark: {
    legend: '#9fb0c4', axisLine: '#24303f', axisLabel: '#7d8da1', splitLine: '#182231',
    gapFill: 'rgba(255,255,255,0.045)', gapFillNegative: 'rgba(216,171,74,0.10)',
  },
  light: {
    legend: '#5d6b7d', axisLine: '#d6dee9', axisLabel: '#71808f', splitLine: '#e7ecf3',
    gapFill: 'rgba(15,32,56,0.05)', gapFillNegative: 'rgba(162,118,28,0.09)',
  },
}

const DISCLAIMER =
  '免责声明：本页为客观历史数据统计（指数与行业的市盈率 TTM、历史极值与当前分位），仅用于数据查阅与学习参考，不代表任何观点或判断，不构成任何投资建议。'

function fmt(v: number | null | undefined, digits = 2) {
  return v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(digits)
}

/** 次要表格可排序字段 */
type IndSortKey = 'market_cap' | 'pe_ttm'

/**
 * 次要表格可排序表头（地域指数 / 宏观行业指数共用）。
 * 点击循环：不排序 → 降序 → 升序 → 不排序。
 */
function IndSortTh({
  label,
  sortKey,
  indSort,
  onSort,
  className,
}: {
  label: string
  sortKey: IndSortKey
  indSort: { key: IndSortKey; dir: 'asc' | 'desc' } | null
  onSort: (key: IndSortKey) => void
  className?: string
}) {
  const active = indSort?.key === sortKey
  return (
    <th className={cn('py-2.5 text-right font-medium', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-mist-300"
      >
        {active ? (
          indSort!.dir === 'desc' ? (
            <ChevronDown size={11} className="text-gold" />
          ) : (
            <ChevronUp size={11} className="text-gold" />
          )
        ) : (
          <span className="inline-block h-[11px] w-[11px] text-center text-[10px] leading-[11px] text-mist-700">
            ⇅
          </span>
        )}
        {label}
      </button>
    </th>
  )
}

/**
 * 当前分位：(当前 - 历史最低) / (历史最高 - 历史最低) * 100。
 * 0% 表示当日值处于历史最低位，100% 表示处于历史最高位。
 */
function rangePct(current?: number | null, min?: number | null, max?: number | null) {
  if (
    current === null ||
    current === undefined ||
    min === null ||
    min === undefined ||
    max === null ||
    max === undefined
  )
    return null
  const c = Number(current)
  const lo = Number(min)
  const hi = Number(max)
  if (!Number.isFinite(c) || !Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null
  return ((c - lo) / (hi - lo)) * 100
}

function PctCell({ value, signed = true }: { value: number | null; signed?: boolean }) {
  if (value === null) return <span className="text-mist-700">—</span>
  const tone = value <= 10 ? 'text-down' : value <= 50 ? 'text-gold' : 'text-up'
  return (
    <span className={cn('tabular-nums', tone)}>
      {signed && value >= 0 ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  )
}

/* ---------------- 走势图：缺失区间留空 ---------------- */

/**
 * 为什么需要这套处理：
 *   原先两个走势图都用 `category` 轴 —— 缺失的日期在轴上根本不存在，
 *   相邻两个真实数据点会被直线直接连起来。于是「建筑 2023-04 ~ 2026-01 完全无数据」
 *   在图上表现成一条平缓的直线，用户会误读成「这几年走势平稳」，而不是「这几年没有数据」。
 *
 * 做法（三步，缺一不可）：
 *   1) x 轴改 `time` —— 横坐标按真实时间线性分布，缺失区间自然占据对应的宽度；
 *   2) 序列按「相邻两点间隔 > GAP_DAYS」切成多段，段间不生成连接线 → 真正留空；
 *   3) 每个缺口叠一层浅色 markArea + 「数据缺失」标注，避免留白被当成渲染故障。
 */
const GAP_DAYS = 15 // A 股最长连续休市约 10 天（春节），超过 15 天才算真缺口
const DAY_MS = 86400000

const tsOf = (d: string) => new Date(`${d}T00:00:00Z`).getTime()
const fmtDay = (ts: number) => new Date(ts).toISOString().slice(0, 10)
const fmtMonth = (ts: number) => new Date(ts).toISOString().slice(0, 7)

/** [时间戳, 数值] —— time 轴要求的数据形态 */
type TimePoint = [number, number]

/** 按时间间隔把序列切成若干连续段：段内点连续，段间留空 */
function splitByGap(points: TimePoint[], gapDays = GAP_DAYS): TimePoint[][] {
  const out: TimePoint[][] = []
  let cur: TimePoint[] = []
  let prev = 0
  for (const p of points) {
    if (cur.length && (p[0] - prev) / DAY_MS > gapDays) {
      out.push(cur)
      cur = []
    }
    cur.push(p)
    prev = p[0]
  }
  if (cur.length) out.push(cur)
  return out
}

/** 找出相邻点之间超过阈值的时间段（用于 markArea 标注「数据缺失」） */
function findGaps(points: TimePoint[], gapDays = GAP_DAYS): Array<[number, number]> {
  const gaps: Array<[number, number]> = []
  for (let i = 1; i < points.length; i++) {
    if ((points[i][0] - points[i - 1][0]) / DAY_MS > gapDays) {
      gaps.push([points[i - 1][0], points[i][0]])
    }
  }
  return gaps
}

/** 时间轴刻度：跨度超过 3 年只显示年份，否则显示年-月（避免刻度过密） */
function timeAxisFormatter(spanMs: number) {
  return (v: number) => (spanMs > 3 * 365 * DAY_MS ? new Date(v).toISOString().slice(0, 4) : fmtMonth(v))
}

/** 把缺口渲染成「浅色色块 + 文案」的独立图层（空数据 series 只承载 markArea）
 *
 * text 由调用方按缺口成因传入：
 *   - 「区间值为负数」= PE 为负、整体法无意义（口径问题，不是抓取失败）
 *   - 「数据缺失」    = 上游确实没有这段数据
 * 两者在图上都是空白，但含义不同，必须让用户一眼分清。
 */
function gapMarkSeries(
  gaps: Array<[number, number]>,
  fill: string,
  labelColor: string,
  text: string,
) {
  if (!gaps.length) return null
  return {
    name: '__gap__',
    type: 'line' as const,
    data: [] as TimePoint[],
    silent: true,
    markArea: {
      silent: true,
      itemStyle: { color: fill },
      label: {
        show: true,
        position: 'insideTop',
        formatter: text,
        fontSize: 10,
        color: labelColor,
      },
      data: gaps.map(([a, b]) => [{ xAxis: a }, { xAxis: b }]),
    },
  }
}

/* ---------------- 走势图 ---------------- */

function PeTrendChart({ rows, isLight }: { rows: PeIndexRow[]; isLight: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const option = useMemo<EChartsOption | null>(() => {
    const pal = isLight ? CHART_PALETTE.light : CHART_PALETTE.dark
    if (rows.length < 2) return null
    // 先按指数分组建 Map<日期, PE>，再逐日 O(1) 查表（避免 O(n²) 的 find）。
    // 现在每个指数只用自己的点，不再对齐到「全日期并集」—— 未对齐才不会被错误连线。
    const byCode = new Map<string, Map<string, number>>()
    for (const r of rows) {
      let m = byCode.get(r.index_code)
      if (!m) byCode.set(r.index_code, (m = new Map()))
      m.set(r.pe_date, Number(r.pe_ttm))
    }
    const allGaps: Array<[number, number]> = []
    const allTs: number[] = []
    const series: unknown[] = []
    for (const meta of INDEX_META) {
      const lineColor = isLight ? meta.colorLight : meta.color
      const own = byCode.get(meta.code)
      if (!own?.size) continue
      const pts: TimePoint[] = [...own.entries()]
        .map(([d, v]) => [tsOf(d), v] as TimePoint)
        .sort((a, b) => a[0] - b[0])
      for (const p of pts) allTs.push(p[0])
      const gaps = findGaps(pts)
      for (const g of gaps) allGaps.push(g)
      // 每个连续段单独成一个 series，段与段之间不连线 → 缺口处留空
      for (const seg of splitByGap(pts)) {
        series.push({
          name: meta.name,
          type: 'line',
          smooth: true,
          data: seg,
          // 不在每个时点画小圆点（点太密会糊成一片），悬停时由十字线提示数值；
          // 历史最低位已在下方表格中列出，图中不再单独标注。
          showSymbol: false,
          itemStyle: { color: lineColor },
          lineStyle: { width: 2 },
        })
      }
    }
    if (!series.length) return null
    const span = Math.max(...allTs) - Math.min(...allTs)
    const gapLayer = gapMarkSeries(allGaps, pal.gapFill, pal.axisLabel, '数据缺失')
    if (gapLayer) series.push(gapLayer)
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        // 十字线随鼠标移动，实时显示该日各指数 PE
        axisPointer: { type: 'cross', label: { fontSize: 10 } },
        // time 轴下 value 是 [时间戳, 数值]，且 axisValue 也是时间戳，必须自己格式化
        formatter: (params: unknown) => {
          const arr = params as Array<{ axisValue?: number; marker?: string; seriesName?: string; value?: unknown }>
          if (!arr?.length) return ''
          const ts = Number(arr[0]?.axisValue)
          const head = Number.isFinite(ts) ? fmtDay(ts) : ''
          const lines = arr
            .filter((p) => p.seriesName !== '__gap__')
            .map((p) => {
              const raw = Array.isArray(p.value) ? p.value[1] : p.value
              const v = Number(raw)
              return `${p.marker ?? ''}${p.seriesName} ${Number.isFinite(v) ? v.toFixed(2) : '—'}`
            })
          return [head, ...lines].join('<br/>')
        },
      },
      legend: { data: INDEX_META.map((m) => m.name), textStyle: { color: pal.legend, fontSize: 11 }, top: 0 },
      grid: { left: 56, right: 24, top: 42, bottom: 34 },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: pal.axisLine } },
        axisLabel: { color: pal.axisLabel, fontSize: 11, hideOverlap: true, formatter: timeAxisFormatter(span) },
      },
      yAxis: {
        type: 'value',
        name: 'PE-TTM',
        nameTextStyle: { color: pal.axisLabel, fontSize: 11 },
        axisLine: { lineStyle: { color: pal.axisLine } },
        axisLabel: { color: pal.axisLabel, fontSize: 11 },
        splitLine: { lineStyle: { color: pal.splitLine } },
      },
      series,
    } as EChartsOption
  }, [rows, isLight])

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

  if (!option) return <p className="py-8 text-center text-[12.5px] text-mist-700">数据点不足，暂无法绘制走势</p>
  return <div ref={ref} style={{ height: 320 }} className="w-full" />
}

/* ---------------- 板块（地域 / 宏观行业）历史 PE 走势图 ---------------- */

function BoardPeChart({
  rows,
  isLight,
  name,
  gapNotes = [],
}: {
  rows: PeIndustryDailyRow[]
  isLight: boolean
  name: string
  /** 该板块的后端缺口备注：reason='negative_pe' 的区间标注为「区间值为负数」 */
  gapNotes?: PeDataGapRow[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const option = useMemo<EChartsOption | null>(() => {
    if (rows.length < 2) return null
    const pal = isLight ? CHART_PALETTE.light : CHART_PALETTE.dark
    const lineColor = isLight ? '#a2761c' : '#d8ab4a'
    // 防御性排序：接口已按日期升序返回，但缺口切分与折线顺序强依赖有序
    const pts: TimePoint[] = rows
      .map((r) => [tsOf(r.pe_date), Number(r.pe_ttm)] as TimePoint)
      .sort((a, b) => a[0] - b[0])
    const gaps = findGaps(pts)
    const segs = splitByGap(pts)
    const span = pts[pts.length - 1][0] - pts[0][0]
    // 按后端备注把缺口分成「负值区间」与「真缺失」两类，分别标注 —— 两者在图上都是空白，
    // 但一个是口径问题（PE 为负、整体法无意义），一个是数据没拿到，不能混为一谈。
    const negRanges = gapNotes
      .filter((n) => n.reason === 'negative_pe')
      .map((n) => [tsOf(n.gap_from), tsOf(n.gap_to)] as [number, number])
    const negGaps: Array<[number, number]> = []
    const plainGaps: Array<[number, number]> = []
    for (const g of gaps) {
      const hit = negRanges.some(([a, b]) => g[0] <= b && g[1] >= a)
      ;(hit ? negGaps : plainGaps).push(g)
    }
    const gapLayers = [
      gapMarkSeries(plainGaps, pal.gapFill, pal.axisLabel, '数据缺失'),
      gapMarkSeries(negGaps, pal.gapFillNegative, pal.axisLabel, '区间值为负数'),
    ].filter(Boolean)
    // ⚠️ 参考线的极值必须**按全量数据现算**，不能用 markLine 的 type:'max'/'min' ——
    // 序列被缺口切成多段后，type 只在「挂载的那一段」内求极值，会给出偏小的区间最大值。
    const values = pts.map((p) => p[1]).filter((v) => Number.isFinite(v))
    const maxV = values.length ? Math.max(...values) : null
    const minV = values.length ? Math.min(...values) : null
    // 主序列按连续段拆开：段间不连线，缺口在 time 轴上自然占出对应宽度
    const series: unknown[] = segs.map((seg) => ({
      name,
      type: 'line',
      data: seg,
      showSymbol: false,
      smooth: true,
      lineStyle: { width: 1.8, color: lineColor },
      itemStyle: { color: lineColor },
    }))
    // 区间最高/最低参考线挂在第一段上（数值来自全量现算，见上面的 maxV/minV）
    if (series.length && maxV !== null && minV !== null) {
      ;(series[0] as Record<string, unknown>).markLine = {
        silent: true,
        symbol: 'none',
        lineStyle: { type: 'dashed', width: 1 },
        data: [
          {
            yAxis: maxV,
            lineStyle: { color: '#c0504d' },
            label: {
              formatter: () => `区间最高 ${maxV.toFixed(2)}`,
              fontSize: 10,
              color: pal.axisLabel,
            },
          },
          {
            yAxis: minV,
            lineStyle: { color: '#3f9e7a' },
            label: {
              formatter: () => `区间最低 ${minV.toFixed(2)}`,
              fontSize: 10,
              color: pal.axisLabel,
            },
          },
        ],
      }
    }
    for (const layer of gapLayers) series.push(layer)
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { fontSize: 10 } },
        formatter: (params: unknown) => {
          const p = (params as Array<{ axisValue?: number; value?: unknown; seriesName?: string }>)
            .find((x) => x.seriesName !== '__gap__')
          if (!p) return ''
          const ts = Number(p.axisValue)
          const raw = Array.isArray(p.value) ? p.value[1] : p.value
          const v = Number(raw)
          return `${Number.isFinite(ts) ? fmtDay(ts) : ''}<br/>PE-TTM ${Number.isFinite(v) ? v.toFixed(2) : '—'}`
        },
      },
      grid: { left: 56, right: 28, top: 30, bottom: 34 },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: pal.axisLine } },
        axisLabel: { color: pal.axisLabel, fontSize: 11, hideOverlap: true, formatter: timeAxisFormatter(span) },
      },
      yAxis: {
        type: 'value',
        name: 'PE-TTM',
        scale: true,
        nameTextStyle: { color: pal.axisLabel, fontSize: 11 },
        axisLine: { lineStyle: { color: pal.axisLine } },
        axisLabel: { color: pal.axisLabel, fontSize: 11 },
        splitLine: { lineStyle: { color: pal.splitLine } },
      },
      series,
    } as EChartsOption
  }, [rows, isLight, name])

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

  if (!option) return <p className="py-8 text-center text-[12.5px] text-mist-700">该板块历史数据不足，暂无法绘制走势</p>
  return <div ref={ref} style={{ height: 300 }} className="w-full" />
}

/* ---------------- 主页面 ---------------- */

export function MarketPage(_props: { view?: 'today' | 'history' } = {}) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  /** 次要表格当前视图：地域指数 / 宏观行业指数 */
  const [indTab, setIndTab] = useState<'region' | 'industry'>('region')
  const [industryQuery, setIndustryQuery] = useState('')
  /** 次要表格排序状态：null = 按代码原始顺序 */
  const [indSort, setIndSort] = useState<{ key: IndSortKey; dir: 'asc' | 'desc' } | null>(null)
  /** 走势图时间段（指数图与板块图共用，默认近一年） */
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD)
  /** 板块走势图当前选中的板块代码 */
  const [boardCode, setBoardCode] = useState('')

  /**
   * 首屏窗口起点：今天往前 13 个月。「近一年」视图只需窗口数据即可完整绘制，
   * 多留的 1 个月是缓冲（交易日分布不均时不至于缺口）。切「近 3 年/全部」再拉全量。
   */
  const sinceRecent = useMemo(() => shiftMonths(new Date().toISOString().slice(0, 10), 13), [])

  // ---- 数据资源：各自独立缓存与加载态；命中会话缓存时不阻塞渲染 ----
  const idxRes = useCachedResource(
    cacheKey('pe:index:recent'),
    useCallback(() => listPeIndex({ since: sinceRecent }), [sinceRecent]),
  )
  /** 历史极值表（67 行）——表格的「历史最低/最高位」直接读它，不再拉全量现算 */
  const extremeRes = useCachedResource(cacheKey('pe:extreme'), listPeExtreme)
  /** 数据缺口备注（极少行）——决定缺口色块标「区间值为负数」还是「数据缺失」 */
  const gapRes = useCachedResource(cacheKey('pe:datagap'), listPeDataGap)
  const gapNotes = gapRes.data ?? []
  const regionRes = useCachedResource(
    cacheKey('pe:industry:region'),
    useCallback(() => listPeIndustry('region'), []),
  )
  const macroRes = useCachedResource(
    cacheKey('pe:industry:industry'),
    useCallback(() => listPeIndustry('industry'), []),
  )

  const indexRows = idxRes.data ?? []
  const industryRows = regionRes.data ?? []
  const macroRows = macroRes.data ?? []

  /** 所选时间段是否需要全量历史（仅「近 3 年 / 全部」需要） */
  const needsFull = period === '3y' || period === 'all'
  /** 全量数据：按需请求（key 为 null 时该资源不加载） */
  const fullRes = useCachedResource(
    needsFull ? cacheKey('pe:index:full') : null,
    useCallback(() => listPeIndex(), []),
  )

  /** 板块下拉列表（跟随表格的「地域指数 / 宏观行业」切换） */
  const boardOptions = useMemo(
    () =>
      (indTab === 'region' ? industryRows : macroRows)
        .slice()
        .sort((a, b) => a.industry_code.localeCompare(b.industry_code)),
    [indTab, industryRows, macroRows],
  )

  /** 切换地域/行业时，若当前选中板块不属于该类型，自动落到第一个 */
  useEffect(() => {
    if (!boardOptions.length) return
    if (!boardOptions.some((r) => r.industry_code === boardCode)) {
      setBoardCode(boardOptions[0].industry_code)
    }
  }, [boardOptions, boardCode])

  /** 板块历史序列：按需加载 + 跟随时间段（近一年取窗口，长时段取该板块全量） */
  const boardRes = useCachedResource(
    boardCode ? cacheKey('pe:board', indTab, boardCode, needsFull ? 'full' : 'recent') : null,
    useCallback(
      () => listPeIndustryDaily(indTab, boardCode, needsFull ? {} : { since: sinceRecent }),
      [indTab, boardCode, needsFull, sinceRecent],
    ),
  )
  const boardRows = boardRes.data ?? []

  /**
   * 每个指数：当日值（窗口内最新一天）+ 历史最低/最高位（读 pe_extreme）。
   *
   * 分位公式与旧版完全一致：(当日 − 历史最低) ÷ (历史最高 − 历史最低) × 100%。
   * 旧版为了这几个数要拉 10084 行全量现算；极值表经过核验与之完全一致，
   * 因此直接读 67 行的小表即可（首屏请求数从 11 次降到 2 次）。
   */
  const summary = useMemo(() => {
    const exMap = new Map<string, PeExtremeRow>()
    for (const e of extremeRes.data ?? []) if (e.kind === 'index') exMap.set(e.target_code, e)
    const latestMap = new Map<string, PeIndexRow>()
    for (const r of indexRows) {
      const cur = latestMap.get(r.index_code)
      if (!cur || r.pe_date > cur.pe_date) latestMap.set(r.index_code, r)
    }
    return INDEX_META.map((meta) => {
      const ex = exMap.get(meta.code) ?? null
      const latest = latestMap.get(meta.code) ?? null
      return {
        ...meta,
        color: isLight ? meta.colorLight : meta.color,
        latest,
        lowest: ex?.min_pe ?? null,
        highest: ex?.max_pe ?? null,
        pct: rangePct(latest?.pe_ttm ?? null, ex?.min_pe ?? null, ex?.max_pe ?? null),
        points: ex?.points ?? null,
      }
    })
  }, [indexRows, extremeRes.data, isLight])

  const latestDate = useMemo(() => {
    let d: string | null = null
    for (const r of indexRows) if (!d || r.pe_date > d) d = r.pe_date
    return d
  }, [indexRows])

  /** 四个指数当日平均 PE-TTM，以及各自历史最低/最高位的平均值 */
  const average = useMemo(() => {
    const cur = summary.map((s) => s.latest?.pe_ttm).filter((v): v is number => typeof v === 'number')
    const mins = summary.map((s) => s.lowest).filter((v): v is number => typeof v === 'number')
    const maxes = summary.map((s) => s.highest).filter((v): v is number => typeof v === 'number')
    const avgCur = cur.length ? cur.reduce((a, b) => a + b, 0) / cur.length : null
    const avgMin = mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null
    const avgMax = maxes.length ? maxes.reduce((a, b) => a + b, 0) / maxes.length : null
    return { avgCur, avgMin, avgMax, pct: rangePct(avgCur, avgMin, avgMax) }
  }, [summary])

  /** 走势图数据源：默认用首屏窗口，切「近 3 年 / 全部」时用按需拉取的全量 */
  const chartSource = needsFull ? (fullRes.data ?? []) : indexRows
  const chartRows = useMemo(
    () => filterByPeriod(chartSource, (r) => r.pe_date, period),
    [chartSource, period],
  )
  /** 图表等待态：已有缓存数据时不显示骨架，避免闪一下 */
  const chartLoading = needsFull ? fullRes.loading && !fullRes.data : idxRes.loading

  /** 按所选时间段过滤后的板块走势数据 */
  const boardChartRows = useMemo(
    () => filterByPeriod(boardRows, (r) => r.pe_date, period),
    [boardRows, period],
  )

  /** 当前选中板块的显示名（同时用于匹配 pe_data_gap 备注） */
  const boardName = useMemo(
    () => boardOptions.find((r) => r.industry_code === boardCode)?.industry_name ?? boardCode,
    [boardOptions, boardCode],
  )

  /** 该板块的后端缺口备注（negative_pe → 图上标「区间值为负数」） */
  const boardGapNotes = useMemo(
    () => gapNotes.filter((n) => n.target_name === boardName),
    [gapNotes, boardName],
  )

  /** 指数走势图当前展示的起止日期（用于角标） */
  const chartBounds = useMemo(() => periodBounds(chartRows, (r) => r.pe_date), [chartRows])

  /** 次要表格当前视图的数据源 */
  const activeRows = indTab === 'region' ? industryRows : macroRows

  const filteredIndustry = useMemo(() => {
    const q = industryQuery.trim()
    const base = q
      ? activeRows.filter(
          (r) => r.industry_code.includes(q) || (r.industry_name ?? '').includes(q),
        )
      : activeRows
    if (!indSort) return base
    // 取出当前排序字段的数值；空值统一排在末尾
    const val = (r: PeIndustryRow): number | null => {
      if (indSort.key === 'market_cap')
        return r.market_cap === null ? null : Number(r.market_cap)
      return r.pe_ttm === null ? null : Number(r.pe_ttm)
    }
    const hasVal = (r: PeIndustryRow) => {
      const v = val(r)
      return v !== null && Number.isFinite(v)
    }
    const withVal = base.filter(hasVal)
    const without = base.filter((r) => !hasVal(r))
    withVal.sort((a, b) =>
      indSort.dir === 'desc' ? Number(val(b)) - Number(val(a)) : Number(val(a)) - Number(val(b)),
    )
    return [...withVal, ...without]
  }, [activeRows, industryQuery, indSort])

  const industryFilled = activeRows.filter((r) => r.pe_ttm !== null).length

  /** 点击表头循环切换排序：不排序 → 降序 → 升序 → 不排序 */
  const toggleIndSort = useCallback((key: IndSortKey) => {
    setIndSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'desc' }
      if (prev.dir === 'desc') return { key, dir: 'asc' }
      return null
    })
  }, [])

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="A-Share Market Data"
        title="市场数据"
        desc={`指数与行业市盈率 TTM · 每交易日收盘后自动更新${latestDate ? ` · 数据截至 ${latestDate}` : ''}`}
      />

      {/* 说明：各区块使用独立的数据资源与加载态，命中会话缓存时直接渲染、不阻塞 */}

      {/* 核心：四指数当日 PE 与历史最低 */}
          <Card padded={false}>
            <div className="border-b border-ink-700 px-4 py-3">
              <h2 className="text-[14.5px] text-mist-100">四大指数市盈率 TTM</h2>
              <p className="mt-0.5 text-[11.5px] text-mist-700">
                历史最低/最高位为 2015 年以来（科创50 自 2020 年指数基日起）每个交易日数据中的极值，右侧为当日 PE-TTM 在历史最低与历史最高之间的分位（0% = 历史最低位，100% = 历史最高位）；
                末行「四大指数平均」为算术平均，<b className="text-mist-500">科创50 的 PE 长期显著高于其余三个指数、会明显抬高均值</b>，横向对比时建议以各指数自身的分位为准
              </p>
            </div>
            <div className="overflow-x-auto">
              {idxRes.loading && !idxRes.data ? (
                <div className="p-4">
                  <div className="skeleton h-44 rounded-xl" />
                </div>
              ) : idxRes.error && !idxRes.data ? (
                <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-8 text-[12.5px] text-mist-700">
                  数据加载失败：{idxRes.error}
                  <button type="button" className="btn btn-ghost" onClick={idxRes.revalidate}>
                    重试
                  </button>
                </div>
              ) : (
              <table className="w-full min-w-[820px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-ink-700 text-left text-mist-700">
                    <th className="px-4 py-2.5 font-medium">指数</th>
                    <th className="px-3 py-2.5 text-right font-medium">当日 PE-TTM</th>
                    <th className="px-3 py-2.5 text-right font-medium">历史最低位</th>
                    <th className="px-3 py-2.5 text-right font-medium">历史最高位</th>
                    <th className="px-3 py-2.5 text-right font-medium">当前分位</th>
                    <th className="px-3 py-2.5 text-right font-medium">收盘价</th>
                    <th className="px-4 py-2.5 text-right font-medium">样本点</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => (
                    <tr key={row.code} className="border-b border-ink-800/70">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2">
                          <i className="h-2 w-2 rounded-full" style={{ background: row.color }} />
                          <span className="text-mist-100">{row.name}</span>
                          <span className="text-[11px] text-mist-700">{row.code}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-[14px] font-semibold tabular-nums text-mist-100">
                        {fmt(row.latest?.pe_ttm)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-down">{fmt(row.lowest)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-up">{fmt(row.highest)}</td>
                      <td className="px-3 py-3 text-right">
                        <PctCell value={row.pct} signed={false} />
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-mist-400">
                        {fmt(row.latest?.close_price)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-mist-700">{row.points}</td>
                    </tr>
                  ))}
                  <tr className="bg-ink-850/60">
                    <td className="px-4 py-3 text-mist-100">
                      四大指数平均
                      <span className="ml-1.5 text-[11px] text-mist-700">（含科创50，均值偏高）</span>
                    </td>
                    <td className="px-3 py-3 text-right text-[15px] font-semibold tabular-nums text-gold-soft">
                      {fmt(average.avgCur)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-down">{fmt(average.avgMin)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-up">{fmt(average.avgMax)}</td>
                    <td className="px-3 py-3 text-right">
                      <PctCell value={average.pct} signed={false} />
                    </td>
                    <td className="px-3 py-3 text-right text-mist-700">—</td>
                    <td className="px-4 py-3 text-right text-mist-700">—</td>
                  </tr>
                </tbody>
              </table>
              )}
            </div>
          </Card>

          {/* 走势图 */}
          <Card>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-[14.5px] text-mist-100">历史 PE-TTM 走势（2015 年以来 · 日频）</h2>
              <span className="text-[11.5px] text-mist-700">
                每交易日一个数据点（每日收盘后自动更新）；科创50 自 2020 年指数基日起有数据
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[11.5px] text-mist-500">
                <span>时间段</span>
                <select
                  className="field w-auto cursor-pointer px-2 py-1 text-[11.5px]"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as PeriodKey)}
                >
                  {PERIOD_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {chartBounds ? (
                  <span className="tabular-nums text-mist-700">
                    {chartBounds[0]} ~ {chartBounds[1]}
                  </span>
                ) : null}
              </div>
            </div>
            {chartLoading ? (
              <div className="skeleton h-[320px] rounded-xl" />
            ) : (
              <PeTrendChart rows={chartRows} isLight={isLight} />
            )}
          </Card>

          {/* 次要：33 个行业 */}
          <Card padded={false}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 px-4 py-3">
              <div>
                <h2 className="text-[14.5px] text-mist-100">
                  {indTab === 'region'
                    ? '同花顺地域指数市盈率 TTM（882001~882033）'
                    : '同花顺宏观行业指数市盈率 TTM（同花顺一级行业）'}
                </h2>
                <p className="mt-0.5 text-[11.5px] text-mist-700">
                  {indTab === 'region' ? `共 33 个地域指数 · 已接入 ${industryFilled} 个` : `共 ${activeRows.length} 个宏观行业 · 已接入 ${industryFilled} 个`}
                  {industryFilled === 0 ? ' · 数据源接入后显示当日值' : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* 地域指数 / 宏观行业指数 切换 */}
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
                      onClick={() => setIndTab(key)}
                      className={cn(
                        'px-2.5 py-1.5 transition',
                        indTab === key
                          ? 'bg-gold/12 text-gold-soft'
                          : 'text-mist-500 hover:bg-ink-850',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  className="field w-44"
                  value={industryQuery}
                  onChange={(e) => setIndustryQuery(e.target.value)}
                  placeholder={indTab === 'region' ? '搜索代码或地区' : '搜索代码或行业'}
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              {(indTab === 'region' ? regionRes : macroRes).loading && !activeRows.length ? (
                <div className="p-4">
                  <div className="skeleton h-64 rounded-xl" />
                </div>
              ) : (
              <table className="w-full min-w-[620px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-ink-700 text-left text-mist-700">
                    <th className="px-4 py-2.5 font-medium">代码</th>
                    <th className="px-3 py-2.5 font-medium">{indTab === 'region' ? '地区' : '行业'}</th>
                    <IndSortTh
                      label="总市值"
                      sortKey="market_cap"
                      indSort={indSort}
                      onSort={toggleIndSort}
                      className="px-3"
                    />
                    <IndSortTh
                      label="当日 PE-TTM"
                      sortKey="pe_ttm"
                      indSort={indSort}
                      onSort={toggleIndSort}
                      className="px-3"
                    />
                    <th className="px-4 py-2.5 text-right font-medium">数据日期</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIndustry.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-[12.5px] text-mist-700">
                        {indTab === 'region' ? '没有匹配的地区' : '没有匹配的行业'}
                      </td>
                    </tr>
                  ) : (
                    filteredIndustry.map((row) => (
                      <tr key={row.id} className="border-b border-ink-800/70">
                        <td className="px-4 py-2.5 tabular-nums text-mist-300">{row.industry_code}</td>
                        <td className="px-3 py-2.5 text-mist-400">{row.industry_name || '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-mist-500">
                          {row.market_cap == null ? '—' : `${Number(row.market_cap).toLocaleString('zh-CN')}亿`}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-mist-100">
                          {fmt(row.pe_ttm)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-mist-500">
                          {row.pe_date ?? '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              )}
            </div>
          </Card>

          {/* 板块历史 PE 走势：可任选单个地域/行业查看，按需加载 */}
          <Card>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-[14.5px] text-mist-100">
                {indTab === 'region' ? '地域指数历史 PE-TTM 走势' : '宏观行业指数历史 PE-TTM 走势'}
              </h2>
              <span className="text-[11.5px] text-mist-700">
                2020-07-01 以来日频数据，每日收盘后自动更新
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[11.5px] text-mist-500">
                <span>时间段</span>
                <select
                  className="field w-auto cursor-pointer px-2 py-1 text-[11.5px]"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as PeriodKey)}
                >
                  {PERIOD_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span>选择{indTab === 'region' ? '地域' : '行业'}</span>
                <select
                  className="field w-auto min-w-[140px] cursor-pointer px-2 py-1 text-[11.5px]"
                  value={boardCode}
                  onChange={(e) => setBoardCode(e.target.value)}
                >
                  {boardOptions.map((r) => (
                    <option key={r.industry_code} value={r.industry_code}>
                      {r.industry_name || r.industry_code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {boardRes.loading && !boardRes.data ? (
              <div className="skeleton h-[300px] rounded-xl" />
            ) : (
              <BoardPeChart
                rows={boardChartRows}
                isLight={isLight}
                name={boardName}
                gapNotes={boardGapNotes}
              />
            )}
            {!boardRes.loading && boardChartRows.length ? (
              <p className="mt-2 text-[11.5px] text-mist-700">
                当前展示 {boardChartRows.length} 个数据点 · {boardChartRows[0].pe_date} ~{' '}
                {boardChartRows[boardChartRows.length - 1].pe_date}
                {boardChartRows.length < boardRows.length
                  ? `（该板块共 ${boardRows.length} 个历史数据点）`
                  : ''}
              </p>
            ) : null}
          </Card>

          <p className="rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-[11.5px] leading-relaxed text-mist-700">
            <b className="text-mist-500">⚠ 口径说明：</b>
            四大指数取 2015 年以来（科创50 自 2020 年基日起）每个交易日的市盈率 TTM，
            历史最低/最高位为同一区间内的极值；「当前分位」= (当日值 − 历史最低) ÷ (历史最高 − 历史最低) × 100%，
            0% 对应历史最低位、100% 对应历史最高位；当某指数创出历史新高或新低时，历史最高/最低位会随当日数据同步刷新。
            地域/行业表格可在「地域指数」（同花顺地域 882001~882033）与「宏观行业」（同花顺一级行业）之间切换；
            点击表头「总市值 / 当日 PE-TTM」可按该列升降序排列，空值统一排在末尾。
            地域/行业板块自 2020-07-01 起保留日频历史，可用下方走势图任选单个板块查看。
            全部数据均在每个交易日收盘后自动更新，表中「当日 PE-TTM」即最近一个交易日的数值。
          </p>
          <p className="rounded-xl border border-dashed border-ink-700 bg-ink-900 px-4 py-3 text-[11.5px] leading-relaxed text-mist-700">
            {DISCLAIMER}
          </p>
    </div>
  )
}
