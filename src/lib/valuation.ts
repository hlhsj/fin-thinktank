/**
 * ── 文件：src/lib/valuation.ts ──────────────────────────────────
 * 功能：估值判定文案与配色映射：把后端「操作导向」的措辞转换成本站「估值导向」的表述。
 * 改动指引：
 *   1. 改展示文案映射 → verdictLabel；
 *   2. 改配色 → verdictTone（涨红跌绿，与价格语义同源）；
 *   3. 加新判定词 → 注意匹配顺序：「观察 / 暂缓」必须排在「建仓」之前，否则会被误判。
 */

/**
 * 估值判定文案与配色（列表页 / 详情页共用）。
 *
 * 为什么单独抽一层：后端 `decision.verdict` 是「操作导向」的措辞（分批建仓 / 接近买点 / 不追），
 * 而本站是学习平台，不该给出交易指令式的表述。前端统一映射为「估值导向」：
 *
 *   分批建仓 / 小仓试探  → 计算合理
 *   接近买点            → 接近合理
 *   不追 / 合理区间内    → 观望
 *   不出手              → 不符合条件
 *
 * 后端文案保持不变（报告与脚本仍按原口径输出），只在前端做展示层转换。
 */

/** 判定 → 展示文案 */
export function verdictLabel(
  verdict?: string | null,
  rejected?: boolean,
  avoid?: boolean,
): string {
  if (rejected) return '淘汰'
  if (avoid) return '回避'
  const v = verdict ?? ''
  // 顺序有讲究：「观察（趋势拐点，暂缓建仓…）」含「建仓」二字，
  // 若先匹配建仓会被误判成「计算合理」——先拦「观察/暂缓」。
  if (/观察|暂缓/.test(v)) return '观望'
  if (/接近买点/.test(v)) return '接近合理'
  if (/建仓|小仓试探/.test(v)) return '计算合理'
  if (/不追|合理区间内|持有/.test(v)) return '观望'
  if (/不出手/.test(v)) return '不符合条件'
  const head = v.split('（')[0]
  return head || '—'
}

/**
 * 判定 → 配色类。
 * 涨红跌绿：偏乐观（计算合理/接近合理）用红，偏谨慎（回避/淘汰/无法定价/不出手）用绿，
 * 纯观望用金。语义与价格颜色同源，读者不需要学第二套配色。
 */
export function verdictTone(
  verdict?: string | null,
  rejected?: boolean,
  avoid?: boolean,
): string {
  if (rejected || avoid) return 'border-down/40 bg-down/10 text-down'
  const label = verdictLabel(verdict, rejected, avoid)
  if (/计算合理|接近合理/.test(label)) return 'border-up/40 bg-up/10 text-up'
  if (/回避|无法定价|不符合条件/.test(label)) return 'border-down/40 bg-down/10 text-down'
  if (/观望/.test(label)) return 'border-gold/40 bg-gold/10 text-gold-soft'
  return 'border-ink-600 text-mist-400'
}

/** 判定是否属于「估值合理」一档（统计用） */
export function isFairVerdict(verdict?: string | null): boolean {
  return /建仓|小仓试探|接近买点/.test(verdict ?? '')
}
