/**
 * ── 文件：src/pages/CompanyResearchPage.tsx ─────────────────────
 * 功能：企业研究表：可排序表格（市值、PE、增速等）+ 智库指数走势图。
 * 数据：company_research、thinktank_index。
 * 改动指引：
 *   1. 加列 → 表头、单元格、排序键三处都要加；
 *   2. 改数字格式 → fmtNum / Dash；
 *   3. 改指数配色 → INDEX_PALETTE；
 *   4. 改行业标签 → industryLabel()。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { echarts, type EChartsOption } from '../lib/echarts'
import { ArrowLeft, ChevronDown, ChevronUp, Search } from 'lucide-react'
import { Card, Disclaimer, PageHeader } from '../components/PageHeader'
import { EmptyState, Spinner } from '../components/ui'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { cn } from '../lib/utils'
import {
  listCompanyResearch,
  listThinktankIndex,
  type CompanyResearchRow,
  type ThinktankIndexRow,
} from '../services/content'

/**
 * 企业研究表（原「交易规划」模块重做）。
 *
 * 数据由管理员从飞书多维表格导入并定期维护，这里只读展示：
 * 智库指数走势 + 搜索 + 行业筛选 + 行业分布折叠卡 + 可排序数据表。
 *
 * 列口径：
 *   当日市值（亿元）—— 每交易日收盘后自动更新；
 *   十年期最低 PE-TTM —— 2016-01-01 至今区间最低市盈率（TTM），来源同花顺 iFinD；
 *   行业 —— 同花顺行业分类「宏观行业 - 细分行业」。
 *
 * 智库指数：成分企业每日涨跌幅的等权平均，自 2020-07-01（基点 1000）累乘，支持时间段浏览，
 *           数据随「企业研究表 · 当日市值每交易日收盘后更新」任务同步更新。
 */

type SortKey =
  | 'default'
  | 'market_cap'
  | 'pe_ttm'
  | 'min_pe_10y'
  | 'current_profit'
  | 'last_year_profit'
  | 'profit_growth_5y'
  | 'dividend_yield'
type SortDir = 'asc' | 'desc'

const N = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v))

function fmtNum(v: number | null, digits = 2) {
  if (v === null) return null
  return v.toLocaleString('zh-CN', { maximumFractionDigits: digits })
}

function Dash() {
  return <span className="text-mist-700">—</span>
}

/** 增速单元格：正增长红、负增长绿（A 股习惯） */
function GrowthCell({ value }: { value: number | null }) {
  if (value === null) return <Dash />
  const tone = value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-mist-300'
  return (
    <span className={cn('tabular-nums', tone)}>
      {value > 0 ? '+' : ''}
      {value.toFixed(2)}%
    </span>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return active ? (
    dir === 'desc' ? (
      <ChevronDown size={11} className="text-gold" />
    ) : (
      <ChevronUp size={11} className="text-gold" />
    )
  ) : (
    <span className="inline-block h-[11px] w-[11px] text-center text-[10px] leading-[11px] text-mist-700">
      ⇅
    </span>
  )
}

/* ---------------- 智库指数走势图 ---------------- */

/** ECharts 配色：按主题取（夜晚 / 白天） */
const INDEX_PALETTE = {
  dark: { line: '#d8ab4a', axisLine: '#24303f', axisLabel: '#7d8da1', splitLine: '#182231' },
  light: { line: '#a2761c', axisLine: '#d6dee9', axisLabel: '#71808f', splitLine: '#e7ecf3' },
}

function IndexTrendChart({ rows, isLight }: { rows: ThinktankIndexRow[]; isLight: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const option = useMemo<EChartsOption | null>(() => {
    if (rows.length < 2) return null
    const pal = isLight ? INDEX_PALETTE.light : INDEX_PALETTE.dark
    const byDate = new Map(rows.map((r) => [r.trade_date, r]))
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { fontSize: 10 } },
        formatter: (params: unknown) => {
          const first = (params as Array<{ axisValue?: string }>)[0]
          const d = first?.axisValue ?? ''
          const row = byDate.get(d)
          if (!row) return d
          const pct =
            row.pct_change === null
              ? '—'
              : `${Number(row.pct_change) > 0 ? '+' : ''}${Number(row.pct_change).toFixed(2)}%`
          return `${d}<br/>点位 ${Number(row.value).toFixed(2)}（${pct}）<br/>上涨 ${row.up_count ?? '—'} · 下跌 ${row.down_count ?? '—'} · 参与 ${row.stock_count ?? '—'} 家`
        },
      },
      grid: { left: 56, right: 24, top: 28, bottom: 34 },
      xAxis: {
        type: 'category',
        data: rows.map((r) => r.trade_date),
        axisLine: { lineStyle: { color: pal.axisLine } },
        axisLabel: { color: pal.axisLabel, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        scale: true,
        name: '点位',
        nameTextStyle: { color: pal.axisLabel, fontSize: 11 },
        axisLine: { lineStyle: { color: pal.axisLine } },
        axisLabel: { color: pal.axisLabel, fontSize: 11 },
        splitLine: { lineStyle: { color: pal.splitLine } },
      },
      series: [
        {
          name: '智库指数',
          type: 'line',
          data: rows.map((r) => Number(r.value)),
          showSymbol: false,
          lineStyle: { width: 1.8, color: pal.line },
          itemStyle: { color: pal.line },
        },
      ],
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

  if (!option)
    return <p className="py-8 text-center text-[12.5px] text-mist-700">数据点不足，暂无法绘制走势</p>
  return <div ref={ref} style={{ height: 300 }} className="w-full" />
}

/** 行业展示：宏观 - 细分 - 三级（同花顺行业分类） */
function industryLabel(row: CompanyResearchRow) {
  const parts = (row.ths_industry || '')
    .split('--')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length >= 2) return parts.join(' - ')
  const macro = row.macro_industry?.trim()
  const sub = row.industry?.trim()
  if (macro && sub) return `${macro} - ${sub}`
  return sub || macro || '未分类'
}

/** 企业研究表：可排序表格 + 智库指数走势。 */
export function CompanyResearchPage() {
  const toast = useToast()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const [rows, setRows] = useState<CompanyResearchRow[]>([])
  const [indexRows, setIndexRows] = useState<ThinktankIndexRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [keyword, setKeyword] = useState('')
  const [industry, setIndustry] = useState('')
  const [distOpen, setDistOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('default')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  /** 智库指数走势图时间段（YYYY-MM，空 = 不限） */
  const [chartStart, setChartStart] = useState('')
  const [chartEnd, setChartEnd] = useState('')

  const load = useCallback(async () => {
    try {
      setRows(await listCompanyResearch())
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
    // 智库指数独立加载：失败仅隐藏该卡片，不影响主表
    try {
      setIndexRows(await listThinktankIndex())
    } catch {
      setIndexRows([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** 行业分布：按「宏观行业 - 细分行业」统计 */
  const industries = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of rows) {
      const key = industryLabel(r)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [rows])

  /** 分布卡按宏观行业聚合 */
  const macroGroups = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of rows) {
      const key = r.macro_industry?.trim() || r.industry || '未分类'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [rows])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    let list = rows
    if (industry) list = list.filter((r) => industryLabel(r) === industry)
    if (kw) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(kw) || industryLabel(r).toLowerCase().includes(kw),
      )
    }
    if (sortKey !== 'default') {
      const dir = sortDir === 'asc' ? 1 : -1
      list = [...list].sort((a, b) => {
        const av = N(a[sortKey])
        const bv = N(b[sortKey])
        if (av === null && bv === null) return 0
        if (av === null) return 1
        if (bv === null) return -1
        return (av - bv) * dir
      })
    }
    return list
  }, [rows, keyword, industry, sortKey, sortDir])

  /** 智库指数可选月份（升序） */
  const chartMonths = useMemo(() => {
    const set = new Set<string>()
    indexRows.forEach((r) => set.add(r.trade_date.slice(0, 7)))
    return Array.from(set).sort()
  }, [indexRows])

  /** 按所选时间段过滤后的指数数据 */
  const chartIndexRows = useMemo(
    () =>
      indexRows.filter((r) => {
        const ym = r.trade_date.slice(0, 7)
        if (chartStart && ym < chartStart) return false
        if (chartEnd && ym > chartEnd) return false
        return true
      }),
    [indexRows, chartStart, chartEnd],
  )

  const toggleSort = (key: Exclude<SortKey, 'default'>) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={22} />
      </div>
    )
  }

  if (error) return <EmptyState title="加载失败" desc={error} />

  const th = 'px-3 py-3 text-right font-medium'
  const td = 'px-3 py-3 text-right'
  const capDate = rows.find((r) => r.cap_updated_at)?.cap_updated_at ?? null
  const latestIndex = indexRows.length ? indexRows[indexRows.length - 1] : null
  const firstIndex = indexRows.length ? indexRows[0] : null

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Research List"
        title="企业研究表"
        desc="共享研究清单，历史数据一目了然。"
        right={
          <Link to="/member" className="btn btn-ghost">
            <ArrowLeft size={14} />
            回首页
          </Link>
        }
      />

      {/* 智库指数：企业研究表成分等权 */}
      {latestIndex ? (
        <Card padded={false}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-ink-700 px-4 py-3">
            <div>
              <h2 className="text-[14.5px] text-mist-100">智库指数</h2>
              <p className="mt-0.5 text-[11.5px] text-mist-700">
                企业研究表成分等权 · 基点 1000（{firstIndex?.trade_date} 起）· 每交易日收盘后自动更新
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="serif text-[24px] tabular-nums text-mist-100">
                {Number(latestIndex.value).toFixed(2)}
              </span>
              <GrowthCell value={N(latestIndex.pct_change)} />
              <span className="text-[11.5px] text-mist-500">
                {latestIndex.trade_date} · 上涨 {latestIndex.up_count ?? '—'} / 下跌{' '}
                {latestIndex.down_count ?? '—'} · 参与 {latestIndex.stock_count ?? '—'} 家
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 px-4 pt-2.5 text-[11.5px] text-mist-500">
            <span>时间段</span>
            <select
              className="field w-auto cursor-pointer px-2 py-1 text-[11.5px]"
              value={chartStart}
              onChange={(e) => setChartStart(e.target.value)}
              aria-label="起始月份"
            >
              <option value="">最早</option>
              {chartMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <span>至</span>
            <select
              className="field w-auto cursor-pointer px-2 py-1 text-[11.5px]"
              value={chartEnd}
              onChange={(e) => setChartEnd(e.target.value)}
              aria-label="截止月份"
            >
              <option value="">最新</option>
              {chartMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {chartStart || chartEnd ? (
              <button
                type="button"
                className="underline-offset-2 hover:text-gold-soft hover:underline"
                onClick={() => {
                  setChartStart('')
                  setChartEnd('')
                }}
              >
                重置
              </button>
            ) : null}
          </div>
          <div className="px-2 pb-2 pt-2">
            <IndexTrendChart rows={chartIndexRows} isLight={isLight} />
          </div>
        </Card>
      ) : null}

      {/* 搜索 + 筛选 + 视图切换 */}
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="relative min-w-[200px] flex-1 sm:max-w-sm">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-700"
          />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索企业 / 行业"
            className="field pl-8"
          />
        </label>

        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="field w-auto min-w-[160px] cursor-pointer appearance-none pr-8"
        >
          <option value="">全部行业</option>
          {industries.map(([name]) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <p className="ml-auto whitespace-nowrap text-[12.5px] text-mist-500">
          显示 <b className="tabular-nums text-mist-100">{filtered.length}</b> / {rows.length} 家
        </p>
      </div>

      {/* 行业分布（折叠卡，按宏观行业聚合） */}
      <div className="rounded-xl border border-ink-700 bg-ink-900">
        <button
          type="button"
          onClick={() => setDistOpen((o) => !o)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span className="h-4 w-1 rounded-full bg-gold" />
          <span className="flex-1">
            <span className="block text-[13.5px] text-mist-100">行业分布</span>
            <span className="block text-[11.5px] text-mist-700">
              {rows.length} 家企业 · {macroGroups.length} 个宏观行业 · 仅统计数量分布
            </span>
          </span>
          <span className="flex items-center gap-1 text-[12px] text-mist-500">
            {distOpen ? '收起' : '展开'}
            {distOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>
        {distOpen && macroGroups.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-t border-ink-700 px-4 py-3">
            {macroGroups.map(([name, count]) => (
              <span
                key={name}
                className="rounded-full border border-ink-700 px-2.5 py-1 text-[12px] text-mist-500"
              >
                {name} <span className="tabular-nums text-mist-700">× {count}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* 数据表格 */}
      <Card padded={false} className="overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="py-14">
            <EmptyState
              title={rows.length === 0 ? '暂无企业数据' : '没有匹配的企业'}
              desc={
                rows.length === 0
                  ? '数据由管理员在运营后台导入后在此展示。'
                  : '试试更换关键词或清除筛选条件。'
              }
            />
          </div>
        ) : (
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b border-ink-700 text-left text-[12px] text-mist-700">
                <th className="px-4 py-3 font-medium">企业 / 数据更新时间</th>
                <th className="px-3 py-3 font-medium">行业</th>
                <th className={th}>
                  <button
                    type="button"
                    onClick={() => toggleSort('market_cap')}
                    className="inline-flex items-center gap-1 hover:text-mist-300"
                  >
                    <SortIcon active={sortKey === 'market_cap'} dir={sortDir} />
                    当日市值（亿）
                  </button>
                </th>
                <th className={th}>
                  <button
                    type="button"
                    onClick={() => toggleSort('pe_ttm')}
                    className="inline-flex items-center gap-1 hover:text-mist-300"
                  >
                    <SortIcon active={sortKey === 'pe_ttm'} dir={sortDir} />
                    当日市盈率（TTM）
                  </button>
                </th>
                <th className={th}>
                  <button
                    type="button"
                    onClick={() => toggleSort('min_pe_10y')}
                    className="inline-flex items-center gap-1 hover:text-mist-300"
                  >
                    <SortIcon active={sortKey === 'min_pe_10y'} dir={sortDir} />
                    十年期最低 PE-TTM
                  </button>
                </th>
                <>
                    <th className={th}>
                      <button
                        type="button"
                        onClick={() => toggleSort('current_profit')}
                        className="inline-flex items-center gap-1 hover:text-mist-300"
                      >
                        <SortIcon active={sortKey === 'current_profit'} dir={sortDir} />
                        当期净利润（亿）
                      </button>
                    </th>
                    <th className={th}>
                      <button
                        type="button"
                        onClick={() => toggleSort('last_year_profit')}
                        className="inline-flex items-center gap-1 hover:text-mist-300"
                      >
                        <SortIcon active={sortKey === 'last_year_profit'} dir={sortDir} />
                        上年净利润（亿）
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort('profit_growth_5y')}
                        className="inline-flex items-center gap-1 hover:text-mist-300"
                      >
                        <SortIcon active={sortKey === 'profit_growth_5y'} dir={sortDir} />
                        近五年平均增速
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort('dividend_yield')}
                        className="inline-flex items-center gap-1 hover:text-mist-300"
                      >
                        <SortIcon active={sortKey === 'dividend_yield'} dir={sortDir} />
                        当前股息率
                      </button>
                    </th>
                </>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-ink-800/60 last:border-0 hover:bg-ink-850/40">
                  <td className="px-4 py-3">
                    <p className="flex flex-wrap items-center gap-1.5 font-medium text-mist-100">{r.name}</p>
                    <p className="text-[11px] tabular-nums text-mist-700">{r.updated_date ?? '—'}</p>
                  </td>
                  <td className="px-3 py-3 text-mist-300">{industryLabel(r)}</td>
                  <td className={cn(td, 'tabular-nums text-mist-100')}>
                    {fmtNum(N(r.market_cap)) ?? <Dash />}
                  </td>
                  <td className={cn(td, 'tabular-nums text-mist-100')}>
                    {fmtNum(N(r.pe_ttm), 2) ?? <Dash />}
                  </td>
                  <td className={cn(td, 'tabular-nums text-mist-100')}>
                    {fmtNum(N(r.min_pe_10y), 2) ?? <Dash />}
                  </td>
                  <>
                      <td className={cn(td, 'tabular-nums text-mist-100')}>
                        {fmtNum(N(r.current_profit)) ?? <Dash />}
                      </td>
                      <td className={cn(td, 'tabular-nums text-mist-300')}>
                        {fmtNum(N(r.last_year_profit)) ?? <Dash />}
                      </td>
                      <td className={cn('px-4 py-3 text-right')}>
                        <GrowthCell value={N(r.profit_growth_5y)} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {N(r.dividend_yield) === null ? (
                          <Dash />
                        ) : (
                          <span className="tabular-nums text-mist-300">
                            {N(r.dividend_yield)!.toFixed(2)}%
                          </span>
                        )}
                      </td>
                  </>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="text-[11.5px] leading-relaxed text-mist-700">
        数据更新时间（企业名下方）随数据变更自动刷新（后台保存、导入或每交易日行情更新时）；
        当日市值与当日市盈率（TTM）为每交易日收盘后自动更新{capDate ? `（最新 ${capDate}）` : ''}；
        智库指数为企业研究表全部成分企业每日涨跌幅的等权平均、自 2020-07-01 起以 1000 点为基点累乘（每交易日收盘后自动更新，可选时间段浏览）；
        当期净利润为最新报告期归母净利润（本期为 2026 中报）；上年净利润为 2025 年报归母净利润；
        近五年平均增速为 2021~2025 各年归母净利润同比增速的算术平均
        （亏损年份增速失真不计入）；十年期最低 PE-TTM 为 2016 年以来区间最低市盈率（TTM，来源同花顺 iFinD）；
        当前股息率为近 12 个月股息率（来源同花顺 iFinD）；行业为同花顺行业分类「宏观 - 细分 - 三级」。净利润单位为亿元，空白项表示该指标无法计算或尚未录入。
      </p>

      <Disclaimer text="企业研究表为历史数据整理与估值观察记录，仅供学习参考，不构成任何投资建议。" />
    </div>
  )
}
