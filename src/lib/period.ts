/**
 * ── 文件：src/lib/period.ts ─────────────────────────────────────
 * 功能：时间区间筛选的通用实现：选项表、按月位移、按行日期过滤、可用区间计算。
 * 改动指引：
 *   1. 加区间（如近 5 年）→ PERIOD_OPTIONS 加一项（key + label + months，全部展示用 null）；
 *   2. 改默认区间 → DEFAULT_PERIOD；
 *   3. 改边界口径（是否含当日）→ filterByPeriod。
 */

/**
 * 走势图时间段的共享定义与过滤工具。
 *
 * 全站走势图（A股温度计的温度/因子曲线、A股市场数据的指数/板块 PE 曲线）
 * 统一使用「预设时间段」下拉，默认展示近一年；以**最后一个数据点**为终点向前推，
 * 因此节假日、停牌等导致的数据缺口不会让窗口变空。
 */

export type PeriodKey = '1m' | '3m' | '6m' | '1y' | '3y' | 'all'

export const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string; months: number | null }> = [
  { key: '1m', label: '近 1 个月', months: 1 },
  { key: '3m', label: '近 3 个月', months: 3 },
  { key: '6m', label: '近 6 个月', months: 6 },
  { key: '1y', label: '近 1 年', months: 12 },
  { key: '3y', label: '近 3 年', months: 36 },
  { key: 'all', label: '全部', months: null },
]

export const DEFAULT_PERIOD: PeriodKey = '1y'

/** YYYY-MM-DD 往前推 n 个月（纯字符串运算，避开时区问题） */
export function shiftMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m) return ymd
  const total = y * 12 + (m - 1) - months
  const ny = Math.floor(total / 12)
  const nm = (total % 12 + 12) % 12
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(d || 1).padStart(2, '0')}`
}

/**
 * 按时间段过滤行数据：以数据中的**最后一天**为终点，保留最近 N 个月。
 * `getDate` 取该行的 YYYY-MM-DD 字符串；`all` 或数据为空时原样返回。
 */
export function filterByPeriod<T>(rows: T[], getDate: (row: T) => string, period: PeriodKey): T[] {
  const opt = PERIOD_OPTIONS.find((p) => p.key === period)
  if (!opt?.months || rows.length < 2) return rows
  let last = ''
  for (const r of rows) {
    const d = getDate(r)
    if (d > last) last = d
  }
  if (!last) return rows
  const cut = shiftMonths(last, opt.months)
  return rows.filter((r) => getDate(r) >= cut)
}

/**
 * 按数据实际跨度裁剪时段选项：数据只有约一年时，「近 3 年」等同于「全部」，
 * 展示出来反而让人误以为可选更长区间，因此直接隐藏。
 */
export function availablePeriods(dates: string[]): typeof PERIOD_OPTIONS {
  const sorted = dates.filter(Boolean).slice().sort()
  if (sorted.length < 2) return PERIOD_OPTIONS.filter((o) => o.key === 'all')
  const [fy, fm] = sorted[0].split('-').map(Number)
  const [ly, lm] = sorted[sorted.length - 1].split('-').map(Number)
  if (!fy || !ly) return PERIOD_OPTIONS
  const spanMonths = ly * 12 + lm - (fy * 12 + fm)
  return PERIOD_OPTIONS.filter((o) => o.months === null || o.months <= spanMonths)
}

/** 时间段的起止（用于图上角标展示），数据为空时返回 null */
export function periodBounds<T>(rows: T[], getDate: (row: T) => string): [string, string] | null {
  if (!rows.length) return null
  let min = getDate(rows[0])
  let max = min
  for (const r of rows) {
    const d = getDate(r)
    if (d < min) min = d
    if (d > max) max = d
  }
  return [min, max]
}
