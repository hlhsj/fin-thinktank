/**
 * ECharts 坐标系配色（按主题取）。
 *
 * 从 `MarketPage.tsx` 提取出来（2026-10-22）：估值详情页的「历史估值」走势图
 * 要与市场数据模块保持同一套观感，两处各写一份迟早漂移——
 * 这个项目已经因为「两处算分」吃过亏（见六维明细与去泡沫的实现纪律）。
 *
 * 为什么是硬编码色值而不是 CSS 变量：ECharts 走 canvas/SVG 渲染，
 * 读不到 `var(--color-*)`，必须把主题色解析成具体值再传给 option。
 */
export const CHART_PALETTE = {
  dark: {
    legend: '#9fb0c4',
    axisLine: '#24303f',
    axisLabel: '#7d8da1',
    splitLine: '#182231',
    /** 「数据缺失」区间的底色 */
    gapFill: 'rgba(255,255,255,0.045)',
    /** 「区间值为负数」的底色（偏暖，便于区分口径问题） */
    gapFillNegative: 'rgba(216,171,74,0.10)',
  },
  light: {
    legend: '#5d6b7d',
    axisLine: '#d6dee9',
    axisLabel: '#71808f',
    splitLine: '#e7ecf3',
    gapFill: 'rgba(15,32,56,0.05)',
    gapFillNegative: 'rgba(162,118,28,0.09)',
  },
}

export interface ChartPalette {
  legend: string
  axisLine: string
  axisLabel: string
  splitLine: string
  gapFill: string
  gapFillNegative: string
}

export const paletteOf = (isLight: boolean): ChartPalette =>
  isLight ? CHART_PALETTE.light : CHART_PALETTE.dark
