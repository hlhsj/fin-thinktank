/**
 * ── 文件：src/lib/types.ts ──────────────────────────────────────
 * 功能：全站行类型（与数据库表一一对应）+ 内容模块元数据 MODULE_META + 评级 / 计划分类等枚举。
 * 改动指引：
 *   1. 表加字段 → 对应 XxxRow 加字段（可空用 | null，新建时可选用 ?）；
 *   2. 改模块名称 / 配色 → MODULE_META；
 *   3. 加下拉选项 → RATING_OPTIONS、PLAN_CATEGORIES。
 */

export type ModuleKey = 'knowledge' | 'company' | 'briefing'
export type ArticleStatus = 'draft' | 'published' | 'archived'

export type Metric = {
  label: string
  value: string
  trend?: 'up' | 'down' | 'flat'
}

export type ArticleRow = {
  id: number
  owner_id: string
  owner_name: string | null
  module: ModuleKey
  title: string
  summary: string | null
  content: string
  cover_url: string | null
  tags: string[]
  status: ArticleStatus
  ticker: string | null
  industry: string | null
  rating: string | null
  issue_date: string | null
  metrics: Metric[]
  featured: boolean
  read_count: number
  created_at: string
  updated_at: string
}

export type ArticleDraft = {
  module: ModuleKey
  title: string
  summary?: string | null
  content?: string
  tags?: string[]
  status?: ArticleStatus
  cover_url?: string | null
  ticker?: string | null
  industry?: string | null
  rating?: string | null
  issue_date?: string | null
  metrics?: Metric[]
  featured?: boolean
}

export type StudyPlanRow = {
  id: number
  owner_id: string
  title: string
  description: string | null
  category: string
  start_date: string | null
  end_date: string | null
  status: 'active' | 'paused' | 'done'
  color: string
  created_at: string
  updated_at: string
}

export type PlanItemRow = {
  id: number
  owner_id: string
  plan_id: number
  title: string
  notes: string | null
  due_date: string | null
  priority: 'high' | 'medium' | 'low'
  status: 'todo' | 'doing' | 'done'
  progress: number
  sort_order: number
  created_at: string
  updated_at: string
}

/**
 * 素材行。**刻意不含 data 列** —— 列表查询必须排除 base64 正文，
 * 否则一次列表就可能拉回几十兆文本。
 */
export type AssetRow = {
  id: number
  owner_id: string
  file_name: string
  content_type: string | null
  size_bytes: number
  kind: 'image' | 'file'
  created_at: string
}

/** 完整素材行，含 base64 正文；只用于写入与单条读取，列表查询必须避开 */
export type AssetBlobRow = AssetRow & { data: string }

export type FavoriteRow = {
  id: number
  owner_id: string
  article_id: number
  created_at: string
}

type ModuleMeta = { key: ModuleKey; label: string; short: string; desc: string; accent: string }

/** 模块点缀色统一走 CSS 变量，白天/夜晚两套色值在 index.css 中定义 */
export const MODULE_META: Record<ModuleKey, ModuleMeta> = {
  knowledge: {
    key: 'knowledge',
    label: '知识库',
    short: '知识',
    desc: '投资方法论、财务分析框架与百科词条',
    accent: 'var(--accent-gold)',
  },
  company: {
    key: 'company',
    label: '企业分析',
    short: '企业',
    desc: '公司基本面、财务质量与估值跟踪',
    accent: 'var(--accent-blue)',
  },
  briefing: {
    key: 'briefing',
    label: '市场简报',
    short: '简报',
    desc: '宏观、行业与市场的定期观察',
    accent: 'var(--accent-jade)',
  },
}

/**
 * 取模块元信息。
 *
 * 直接写 `MODULE_META[key]` 时，只要数据库里出现一个预期外的 module 值，
 * 就会拿到 undefined，紧接着读取 `.accent` 抛 TypeError —— React 会把整棵树
 * 卸载，页面直接白屏。这里统一兜底到知识库，宁可展示错也不能崩。
 */
export function moduleMeta(key?: string | null): ModuleMeta {
  return MODULE_META[(key ?? '') as ModuleKey] ?? MODULE_META.knowledge
}

/** 云端返回的数组列偶尔会是 null，读写前统一归一，避免 `.length` 之类的调用炸掉 */
export function safeList<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

export const RATING_OPTIONS = ['强烈推荐', '增持', '中性', '减持', '观望'] as const
export const PLAN_CATEGORIES = [
  { key: 'general', label: '综合' },
  { key: 'study', label: '系统学习' },
  { key: 'research', label: '研究任务' },
  { key: 'review', label: '复盘' },
] as const

/* ---------------- 学习平台各业务表 ---------------- */

export interface ChapterRow {
  id: number
  parent_id: number | null
  kind: 'chapter' | 'section'
  title: string
  summary: string | null
  content: string
  order_no: number
  visible_to: string
  updated_at: string
}

export interface GlossaryRow {
  id: number
  term: string
  explanation: string
  category: string
  order_no: number
  updated_at: string
}

export interface ReviewRow {
  id: number
  week_no: number
  week_label: string | null
  title: string
  summary: string | null
  content: string
  published_at: string | null
  updated_at: string
}

export interface CaseRow {
  id: number
  title: string
  cover_url: string | null
  summary: string | null
  content: string
  status: 'live' | 'ended' | 'upcoming'
  start_at: string | null
  replay_url: string | null
  duration: string | null
  order_no: number
}

export interface MarketRow {
  id: number
  data_date: string
  is_rest_day: boolean
  whole_temp: number | null
  tech_temp: number | null
  dividend_temp: number | null
  dividend_yield: number | null
  pe_median: number | null
  industries: Array<{ name: string; pct: number }> | null
  note: string | null
  /** 两市成交额（元），用于换算万亿/亿 */
  turnover_cny: number | null
  /** 上一交易日成交额，用于算「较上日」 */
  turnover_prev_cny: number | null
  advancers: number | null
  decliners: number | null
  limit_up: number | null
  limit_down: number | null
}

export interface ExtremeRow {
  metric_type: string
  label: string
  unit: string
  min_val: number | null
  max_val: number | null
  min_date: string | null
  max_date: string | null
}

export interface MessageRow {
  id: number
  user_id: string
  author_name: string
  content: string
  is_anonymous: boolean
  is_private: boolean
  reply: string | null
  replied_at: string | null
  pinned: boolean
  created_at: string
}

export interface PositionRow {
  id: number
  owner_id: string
  symbol: string
  stock_name: string
  cost: number
  amount: number
  note: string | null
  updated_at: string
}

export interface TradeRow {
  id: number
  owner_id: string
  symbol: string
  stock_name: string
  action: 'buy' | 'sell'
  price: number
  quantity: number
  traded_at: string | null
  note: string | null
}

/**
 * 企业研究表（company_research）：管理员导入的共享研究清单，
 * 字段口径源自飞书多维表格「花落智库100 / 企业估值观察表」。
 */
export interface CompanyResearchRow {
  id: number
  name: string
  /** 细分行业（同花顺二级） */
  industry: string
  /** 宏观行业（同花顺一级） */
  macro_industry: string | null
  /** 同花顺行业完整路径：一级--二级--三级 */
  ths_industry: string | null
  tracking: string | null
  preference: string | null
  selected_at: string | null
  updated_date: string | null
  /** 当日市值（亿元），每交易日收盘后更新 */
  market_cap: number | null
  /** 当日市盈率（TTM），每交易日收盘后更新 */
  pe_ttm: number | null
  cap_updated_at: string | null
  net_asset: number | null
  beta: number | null
  payout_ratio: number | null
  retention_ratio: number | null
  buyback_ratio: number | null
  last_year_profit: number | null
  /** 当期归母净利润（亿元）：最新报告期，优先 2026 中报 */
  current_profit: number | null
  /** 近五年归母净利润平均增速（%），2021~2025 各年同比增速的算术平均 */
  profit_growth_5y: number | null
  /** 当前股息率（近 12 个月，%） */
  dividend_yield: number | null
  /** 十年期最低 PE-TTM（2016 年至今） */
  min_pe_10y: number | null
  ev: number | null
  gdp_growth: number | null
  risk_free_rate: number | null
  note: string | null
  sort_order: number
  created_at: string
}

export interface MaterialRow {
  id: number
  title: string
  mtype: string
  summary: string | null
  file_url: string | null
  content: string | null
  sort_order: number
  created_at: string
}

export interface HomeworkRow {
  id: number
  period: string
  title: string
  content: string
  status: string
  published_at: string
  deadline: string | null
}

export interface SubmitRow {
  id: number
  homework_id: number
  user_id: string
  user_name: string
  content: string
  score: number | null
  review: string | null
  submitted_at: string
}

export interface PhoneChangeRow {
  id: number
  user_id: string | null
  old_phone: string
  new_phone: string
  remark: string | null
  status: string
  created_at: string
  handled_at: string | null
}

export interface OrderRow {
  id: number
  user_id: string | null
  phone: string | null
  nickname: string | null
  product_type: string
  product_name: string
  amount: number
  /** 购买份数（1 份 = 学员 30 天 / 高级学员 90 天） */
  quantity: number | null
  /** 该订单应发放的权益天数（由服务端按份数计算），确认收款时按此天数顺延 */
  days: number | null
  pay_type: string
  status: string
  remark: string | null
  created_at: string
  confirmed_at: string | null
}

/** 指数 PE-TTM 观测点（年度快照 kind='snapshot' / 最新交易日 kind='latest'） */
export interface PeIndexRow {
  id: number
  index_code: string
  index_name: string
  pe_date: string
  pe_ttm: number
  close_price: number | null
  /** daily = 每交易日一个点（2015 起）；snapshot/monthly/latest 为历史口径，已弃用 */
  kind: 'daily' | 'snapshot' | 'monthly' | 'latest'
  source: string
  created_at: string
}

/** 同花顺地域/行业板块的**日频** PE-TTM 历史序列（2020-07-01 起，用于历史走势图） */
export interface PeIndustryDailyRow {
  id: number
  industry_code: string
  industry_name: string
  /** region = 同花顺地域类；industry = 同花顺一级行业 */
  kind: string
  pe_date: string
  pe_ttm: number
  source: string
  created_at: string
}

/**
 * 历史 PE 极值（pe_extreme，67 行 = 4 指数 + 33 地域 + 30 行业）。
 *
 * 由每交易日收盘后的任务按「当日值 vs 已存极值」增量维护：只在创出新高/新低时才更新，
 * 因此前端表格直接读这张小表即可，无需拉全量历史现算。
 */
export interface PeExtremeRow {
  id: number
  kind: 'index' | 'region' | 'industry'
  target_code: string
  target_name: string | null
  min_pe: number | null
  min_date: string | null
  max_pe: number | null
  max_date: string | null
  /** 极值统计区间起点（指数自 2015、板块自 2020-07 起） */
  sample_start: string | null
  /** 参与极值统计的数据点数 */
  points: number | null
  updated_at: string | null
}

/**
 * 数据缺口备注（pe_data_gap）。
 *
 * 用于区分「这段为什么没有数据」——两者在图上都是空白，但含义完全不同：
 *   - negative_pe：该区间 PE 为负，整体法市盈率无意义（不是抓取失败）
 *   - no_data    ：上游确实没有这段数据
 * 前端的缺口色块文案据此切换（「区间值为负数」/「数据缺失」），避免把口径问题当故障。
 */
export interface PeDataGapRow {
  id: number
  kind: 'index' | 'region' | 'industry'
  target_code: string
  target_name: string | null
  gap_from: string
  gap_to: string
  reason: 'negative_pe' | 'no_data' | 'delisted'
  /** 是否已用真实请求确认过（false = 仅推测，仅作展示提示） */
  verified: boolean
  note: string | null
}

/** 同花顺行业 PE-TTM（882001~882033），数值待数据源接入 */
export interface PeIndustryRow {
  id: number
  /** region = 同花顺地域指数；industry = 同花顺宏观行业（一级行业）指数 */
  kind: string
  industry_code: string
  industry_name: string
  pe_ttm: number | null
  pe_date: string | null
  hist_min_pe: number | null
  hist_min_date: string | null
  market_cap: number | null
  source: string | null
  note: string | null
  updated_at: string
}

/** 智库指数：企业研究表 95 家企业每日涨跌幅的等权平均，累乘指数（基点 1000） */
export interface ThinktankIndexRow {
  id: number
  trade_date: string
  /** 指数点位 */
  value: number
  /** 指数当日涨跌幅（%），基期为空 */
  pct_change: number | null
  /** 当日上涨 / 下跌家数 */
  up_count: number | null
  down_count: number | null
  /** 当日参与计算的企业数 */
  stock_count: number | null
}

/** A股温度计快照（market_temp）：7 因子等权百分位合成的 0-100 温度 */
export interface MarketTempRow {
  id: number
  as_of_date: string
  temperature: number
  label: string
  pct_rank: number | null
  factors: Record<string, number> | null
  stats: {
    min?: number
    max?: number
    median?: number
    mean?: number
    std?: number
    days?: number
  } | null
  prev_date: string | null
  prev_temperature: number | null
  /** 近一年逐日序列：dates 与 temperature、factors[因子键] 按下标一一对应 */
  series: {
    dates: string[]
    temperature: number[]
    factors: Record<string, number[]>
  } | null
  source: string | null
  window_start: string | null
  created_at: string
}

/** 高级学员课程回放（视频托管在第三方平台，这里管理链接与元信息） */
export interface CourseVideoRow {
  id: number
  title: string
  period: string | null
  summary: string | null
  url: string
  duration: string | null
  published: boolean
  sort_order: number
  created_at: string
}

/**
 * 温度计全量历史明细（market_temp_history，2018-11-08 起）。
 *
 * 与 market_temp.series 的关系：后者只保留近一年 250 个交易日（首页快速加载），
 * 本表提供完整历史，供走势图「近 3 年 / 全部」时段按需查询。
 */
export interface MarketTempHistoryRow {
  id: number
  trade_date: string
  temperature: number
  label: string | null
  momentum: number | null
  volume: number | null
  volatility: number | null
  risk_appetite: number | null
  style: number | null
  breadth: number | null
  margin: number | null
  created_at: string
}
