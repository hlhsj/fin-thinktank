/**
 * ── 文件：src/lib/thermo.ts ─────────────────────────────────────
 * 功能：温度计领域常量与工具：五档分区 ZONES、7 因子元数据 FACTOR_META、series 解析、
 *       CSS 变量取值 resolveCssVar。
 * 改动指引：
 *   1. 改分区阈值 / 名称 / 颜色 → ZONES（阈值 20/40/60/80，颜色建议用 --color-up 等变量）；
 *   2. 加 / 删因子 → FACTOR_META 加条目，同时服务端 series.factors 必须有同名字段，否则详情页空白；
 *   3. 改因子说明 → FACTOR_META[].desc（因子详情页直接渲染）。
 */

import type { MarketTempRow } from './types'

/**
 * A股温度计 · 共享常量与工具。
 *
 * 温度由 7 个市场情绪因子等权合成（0-100 历史百分位）：
 * 0-20 极度恐慌 / 20-40 恐慌 / 40-60 中性 / 60-80 贪婪 / 80-100 极度贪婪。
 * 颜色全部走主题变量，日夜模式自动适配。
 */

export const ZONES = [
  { max: 20, name: '极度恐慌', color: 'var(--color-down)' },
  { max: 40, name: '恐慌', color: 'var(--color-jade)' },
  { max: 60, name: '中性', color: 'var(--color-gold)' },
  { max: 80, name: '贪婪', color: 'var(--accent-coral)' },
  { max: Infinity, name: '极度贪婪', color: 'var(--color-up)' },
] as const

export function zoneOf(value: number) {
  return ZONES.find((z) => value < z.max) ?? ZONES[ZONES.length - 1]
}

export interface FactorMeta {
  key: string
  label: string
  desc: string
}

/** 7 个因子：key 同时是 market_temp.series.factors 的字段名与路由参数 */
export const FACTOR_META: FactorMeta[] = [
  {
    key: 'momentum',
    label: '市场动量',
    desc: '沪深300ETF 收盘价相对 125 日（半年线）均线偏离度的历史百分位：高于均线越远越贪婪。',
  },
  {
    key: 'volume',
    label: '成交活跃度',
    desc: '沪深300ETF 成交额在近 250 个交易日中的滚动百分位：放量代表市场活跃。',
  },
  {
    key: 'volatility',
    label: '波动率(反向)',
    desc: '60 日 ATR 比率（含跳空的真实波动幅度）的历史百分位取反：波动越大得分越低（越恐慌）。',
  },
  {
    key: 'risk_appetite',
    label: '风险偏好',
    desc: '沪深300ETF 与国债ETF 的 60 日动量差的历史百分位：股票相对债券走强代表风险偏好上升。',
  },
  {
    key: 'style',
    label: '大小盘风格',
    desc: '中证1000ETF 与沪深300ETF 的 60 日相对强弱的历史百分位：小盘跑赢代表风险偏好较高。',
  },
  {
    key: 'breadth',
    label: '赚钱效应',
    desc: '沪深300ETF 近 20 日上涨日占比的历史百分位（全市场涨跌家数的代理指标）。',
  },
  {
    key: 'margin',
    label: '融资融券',
    desc: '沪深两市融资融券余额 60 日变化率的历史百分位：杠杆扩张（余额上升）代表情绪转暖。',
  },
]

/** 把 market_temp.series 归一成数值数组（数据库 numeric 可能以字符串返回） */
export function seriesOf(data: MarketTempRow | null | undefined) {
  const s = data?.series
  if (!s || !Array.isArray(s.dates) || !s.dates.length) return null
  const dates = s.dates.map(String)
  const temperature = (s.temperature ?? []).map(Number)
  const factors: Record<string, number[]> = {}
  for (const [key, arr] of Object.entries(s.factors ?? {})) {
    if (Array.isArray(arr)) factors[key] = arr.map(Number)
  }
  return { dates, temperature, factors }
}

/**
 * ECharts 需要具体色值，而主题色以 CSS 变量形式存在（如 var(--color-down)）。
 * 这里把变量名解析为当前主题下的实际颜色。
 */
export function resolveCssVar(expr: string, fallback = '#d8ab4a'): string {
  const matched = /var\((--[^)]+)\)/.exec(expr)
  if (!matched) return expr
  const value = getComputedStyle(document.documentElement).getPropertyValue(matched[1]).trim()
  return value || fallback
}
