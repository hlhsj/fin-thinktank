import type { StockValuationDimItem } from './types'

/**
 * 六维明细的展示口径（估值卡与「六维明细」独立页共用）。
 *
 * 为什么单独抽出来：同一份数据在两处渲染（侧栏小卡 / 独立页表格），
 * 格式化规则一旦分叉，就会出现「这里显示 0.1%、那里显示 10.5%」。
 */

/** 维度顺序与中文名：顺序固定，避免不同股票之间来回跳 */
export const DIM_ORDER = ['profit', 'cashflow', 'growth', 'solvency', 'operation', 'asset'] as const

export const DIM_LABELS: Record<string, string> = {
  profit: '盈利',
  cashflow: '现金流',
  growth: '成长',
  solvency: '偿债',
  operation: '营运',
  asset: '资产',
}

/** 每个维度主要看什么（独立页的副标题，降低阅读门槛） */
export const DIM_HINTS: Record<string, string> = {
  profit: 'ROE、净利率、毛利率、ROIC（ROIC 按 −8% 资金成本打分）',
  cashflow: '现金含量、收现比、FCF 利润率、经营现金流为负年数',
  growth: '营收/净利 CAGR 与最新同比、增长现金支撑、扣非占比、趋势一致性',
  solvency: '流动比率（同业分位）、速动、现金比率、利息保障；银行看资本充足率',
  operation: '周转率与周转天数，全部走同业分位——行业差异太大，绝对阈值会误判',
  asset: '资产负债率、有息负债率、商誉占比；银行看不良率、拨备、资本充足率',
}

export const DIM_STATE_LABELS: Record<string, string> = {
  stable: '稳定',
  decelerate: '降速',
  inflection: '拐点',
  stagnant: '停滞',
  collapse: '由盈转亏',
  unknown: '未判定',
}

export const BASIS_LABELS: Record<StockValuationDimItem['basis'], string> = {
  anchor: '阈值锚点',
  peer: '同业分位',
  table: '查表',
}

/**
 * 按 unit 格式化数值。
 * 注意：`unit = pct` 时后端传来的**已经是百分数**（10.5 表示 10.5%），不要再乘 100。
 */
export function fmtByUnit(
  v: number | string | null | undefined,
  unit: StockValuationDimItem['unit'],
): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return DIM_STATE_LABELS[v] ?? v
  if (!Number.isFinite(v)) return '—'
  if (unit === 'pct') return `${v.toFixed(1)}%`
  if (unit === 'x') return `${v.toFixed(2)}×`
  // 天数跨度极大（茅台应收 0.02 天、存货 1399 天），小数位按量级切换
  if (unit === 'days') return v >= 100 ? `${Math.round(v)} 天` : v >= 1 ? `${v.toFixed(1)} 天` : '<1 天'
  return v.toFixed(0)
}

/** 得分 → 文字色（与六维进度条同一套：≥80 红、60–79 金、40–59 灰、<40 绿） */
export function scoreTone(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'text-mist-700'
  if (v >= 80) return 'text-up'
  if (v >= 60) return 'text-gold-soft'
  if (v >= 40) return 'text-mist-400'
  return 'text-down'
}

export function barTone(v: number | null): string {
  if (v === null) return 'bg-ink-700'
  if (v >= 80) return 'bg-up'
  if (v >= 60) return 'bg-gold'
  if (v >= 40) return 'bg-mist-700'
  return 'bg-down'
}

/** 维度得分 → 0–100（画进度条用） */
export function clampScore(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null
}
