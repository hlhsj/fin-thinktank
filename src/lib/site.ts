/** 站点级常量：品牌、合规、权益口径 */
export const SITE = {
  /** 顶部 Logo 用的字母，跟随主理人习惯 */
  logoMark: '超',
  name: '金融学习平台',
  subName: '智库系统',
  fullName: '金融学习平台 · 智库系统',
  owner: '超',
  reference: 'https://shenqivision.top/',
} as const

export const DISCLAIMER =
  '本页为客观历史数据统计，仅用于数据查阅与学习参考，不构成投资建议。'

/** 权益套餐：价格与时长，用于下单金额与到期时间推算 */
export const PLANS = [
  {
    key: 'member',
    name: '学员权益',
    price: '128 元 / 月',
    priceValue: 128,
    period: '月',
    days: 30,
    desc: '学习资料库、复盘文档库、经典案例分析、A 股市场数据、学员留言板、企业研究表；按月支付',
    accent: 'var(--accent-gold)',
  },
  {
    key: 'master',
    name: '高级学员权益',
    price: '888 元 / 季度',
    priceValue: 888,
    period: '季度',
    days: 90,
    desc: '包含学员全部权益，另含进阶研报库、顶级投研能力培养与作业结营；仅支持按季度支付',
    accent: 'var(--accent-purple)',
  },
] as const

export type PlanKey = (typeof PLANS)[number]['key']

/** 到期日推算：从今天或原到期日（未过期则顺延）起加 N 天 */
export function extendFrom(baseIso: string | null | undefined, days: number) {
  const base =
    baseIso && new Date(`${baseIso}T23:59:59`).getTime() > Date.now()
      ? new Date(`${baseIso}T23:59:59`)
      : new Date()
  base.setDate(base.getDate() + days)
  return base.toISOString().slice(0, 10)
}
