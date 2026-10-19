/**
 * ── 文件：src/services/content.ts ───────────────────────────────
 * 功能：内容与行情域的全部读写：知识库、复盘、案例、研报、留言、订单、PE、温度计、企业研究等，
 *       统一封装表名、列名与排序。
 * 改动指引：
 *   1. 加一张表的 CRUD → 参考 listReviews / getReview / saveReview 的写法（列表 + 单条 + 写 + 删）；
 *   2. 列表只取需要的列 → 各函数的列常量，减少传输体积；
 *   3. 可能超过 1000 行 → 必须走 selectAll() 分页（云库单次查询硬上限 1000 行，且会静默截断）；
 *   4. 写大 JSON（温度曲线等）→ 用增量更新，整段重写容易触发 22P02。
 */

import { cloud } from '../lib/cloud'
import type {
  CaseRow,
  ChapterRow,
  CompanyResearchRow,
  CourseVideoRow,
  ExtremeRow,
  GlossaryRow,
  HomeworkRow,
  MarketRow,
  MarketTempHistoryRow,
  MarketTempRow,
  MaterialRow,
  MessageRow,
  OrderRow,
  PeDataGapRow,
  PeExtremeRow,
  PeIndexRow,
  PeIndustryDailyRow,
  PeIndustryRow,
  PhoneChangeRow,
  PositionRow,
  ReviewRow,
  SubmitRow,
  ThinktankIndexRow,
  TradeRow,
} from '../lib/types'

export type {
  CaseRow,
  ChapterRow,
  CompanyResearchRow,
  CourseVideoRow,
  ExtremeRow,
  GlossaryRow,
  HomeworkRow,
  MarketRow,
  MarketTempHistoryRow,
  MarketTempRow,
  MaterialRow,
  MessageRow,
  OrderRow,
  PeDataGapRow,
  PeExtremeRow,
  PeIndexRow,
  PeIndustryDailyRow,
  PeIndustryRow,
  PhoneChangeRow,
  PositionRow,
  ReviewRow,
  SubmitRow,
  ThinktankIndexRow,
  TradeRow,
}

/**
 * 内容服务层：直接操作云端数据表。
 *
 * 注意：本站采用自建账号体系（无云服务会话），各表的写入不做服务端 owner 校验，
 * 行归属由这里的查询条件保证 —— 交易规划、作业提交等私有数据一律按 owner_id 过滤。
 */

function rows<T>(data: unknown): T[] {
  return (data ?? []) as unknown as T[]
}

/** 云服务端对单次查询的默认行数上限（实测：limit 传再大也只返回 1000 行） */
const DB_PAGE_SIZE = 1000

/**
 * 分页拉取查询结果的**全量**行。
 *
 * ⚠️ 必须分页的原因：云服务端对单次查询有 1000 行硬上限，超出部分会被**静默丢弃**——
 * 既不报错，前端也无从察觉。本项目中由定时任务日积月累写入的时序数据（智库指数、PE 观测点、
 * 留言、订单等）一旦超过 1000 行，直接 `select('*')` 升序查询拿到的就只是**最早**的 1000 行，
 * 新数据永远排在这 1000 行之外、页面上看不到。历史故障：智库指数走势图最新只到 2024-08-09，
 * 定时任务其实每天写入成功，但前端一直显示最初那批数据。
 *
 * 用法：把「构造查询」的这一步传进来，由本函数负责翻页与拼接。
 * ```ts
 * return selectAll<OrderRow>((from, to) =>
 *   cloud.database.from('orders').select('*').order('created_at', { ascending: false }).range(from, to),
 * )
 * ```
 */
async function selectAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += DB_PAGE_SIZE) {
    const { data, error } = await query(from, from + DB_PAGE_SIZE - 1)
    if (error) throw error
    const chunk = rows<T>(data)
    out.push(...chunk)
    if (chunk.length < DB_PAGE_SIZE) break
  }
  return out
}

/* ---------------- 学习资料库 ---------------- */

/**
 * 学习资料库章节（含正文）。
 *
 * ⚠️ 安全：`doc_chapter` 是**付费内容**，已收回匿名角色的读权限 ——
 * 登录用户需通过服务端函数读取，函数会校验令牌与会员/高级学员权益；
 * 无权益用户会收到 NO_ENTITLEMENT（前端按「暂无内容」降级展示即可）。
 */
export async function listChapters(auth: SessionAuth): Promise<ChapterRow[]> {
  const { data, error } = await rpcAny('app_read_chapters', {
    p_uid: auth.uid,
    p_token: auth.token ?? '',
  })
  if (error) throw error
  const all = (data ?? []) as ChapterRow[]
  // 章与小节共用 order_no，直接平铺会让不同章的小节互相穿插；
  // 这里重排为「章 → 该章小节」的树形顺序，前后台都按此顺序渲染。
  const roots = all.filter((r) => !r.parent_id)
  const result: ChapterRow[] = []
  roots.forEach((c) => {
    result.push(c)
    result.push(...all.filter((r) => r.parent_id === c.id))
  })
  // 兜底：父章已不存在的孤儿小节追加到末尾，避免丢失
  const orphan = all.filter((r) => r.parent_id && !roots.some((c) => c.id === r.parent_id))
  result.push(...orphan)
  return result
}

/** 新增或更新章节（仅管理员；row.id 存在即为更新），返回章节 id */
export async function saveChapterAdmin(
  auth: SessionAuth,
  row: Partial<ChapterRow> & { title: string },
): Promise<number> {
  const { data, error } = await rpcAny('app_admin_save_chapter', {
    p_uid: auth.uid,
    p_token: auth.token ?? '',
    p_id: row.id ?? null,
    p_title: row.title,
    p_summary: row.summary ?? null,
    p_content: row.content ?? null,
    p_kind: row.kind ?? null,
    p_order_no: row.order_no ?? null,
    p_visible_to: row.visible_to ?? null,
    p_parent_id: row.parent_id ?? null,
  })
  if (error) throw error
  const id = typeof data === 'number' ? data : Array.isArray(data) ? Number(data[0]) : NaN
  if (!Number.isFinite(id)) throw new Error('保存失败，请重试')
  return id
}

/** 删除章节（仅管理员）：级联删除其下小节（表上有 ON DELETE CASCADE） */
export async function deleteChapterAdmin(auth: SessionAuth, id: number) {
  const { error } = await rpcAny('app_admin_delete_chapter', {
    p_uid: auth.uid,
    p_token: auth.token ?? '',
    p_id: id,
  })
  if (error) throw error
}

export async function listGlossary(keyword?: string): Promise<GlossaryRow[]> {
  return selectAll<GlossaryRow>((from, to) => {
    let builder = cloud.database
      .from('glossary')
      .select('*')
      .order('category', { ascending: true })
      .order('order_no', { ascending: true })
    if (keyword) builder = builder.ilike('term', `%${keyword}%`)
    return builder.range(from, to)
  })
}

export async function saveGlossary(row: Partial<GlossaryRow> & { term: string }) {
  const { error } = await cloud.database
    .from('glossary')
    .insert({ ...row, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function updateGlossary(id: number, patch: Partial<GlossaryRow>) {
  const { error } = await cloud.database
    .from('glossary')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteGlossary(id: number) {
  const { data, error } = await cloud.database.from('glossary').delete().eq('id', id).select('id')
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) throw new Error('删除未生效：该词条可能已不存在')
}

/* ---------------- 复盘文档库 ---------------- */

export async function listReviews(): Promise<ReviewRow[]> {
  return selectAll<ReviewRow>((from, to) =>
    cloud.database.from('review').select('*').order('week_no', { ascending: false }).range(from, to),
  )
}

export async function getReview(id: number): Promise<ReviewRow | null> {
  const { data, error } = await cloud.database.from('review').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as unknown as ReviewRow | null) ?? null
}

export async function saveReview(row: Partial<ReviewRow> & { title: string; week_no: number }) {
  const { error } = await cloud.database.from('review').insert(row)
  if (error) throw error
}

export async function updateReview(id: number, patch: Partial<ReviewRow>) {
  const { error } = await cloud.database
    .from('review')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteReview(id: number) {
  const { data, error } = await cloud.database.from('review').delete().eq('id', id).select('id')
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) throw new Error('删除未生效：该复盘可能已不存在')
}

/* ---------------- 经典案例分析 ---------------- */

export async function listCases(): Promise<CaseRow[]> {
  return selectAll<CaseRow>((from, to) =>
    cloud.database.from('case_video').select('*').order('order_no', { ascending: true }).range(from, to),
  )
}

export async function getCase(id: number): Promise<CaseRow | null> {
  const { data, error } = await cloud.database
    .from('case_video')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as CaseRow | null) ?? null
}

export async function saveCase(row: Partial<CaseRow> & { title: string }) {
  const { error } = await cloud.database.from('case_video').insert(row)
  if (error) throw error
}

export async function updateCase(id: number, patch: Partial<CaseRow>) {
  const { error } = await cloud.database.from('case_video').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteCase(id: number) {
  const { data, error } = await cloud.database.from('case_video').delete().eq('id', id).select('id')
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) throw new Error('删除未生效：该案例可能已不存在')
}

/* ---------------- 市场数据 ---------------- */

export async function listMarket(days = 120): Promise<MarketRow[]> {
  const { data, error } = await cloud.database
    .from('market_data')
    .select('*')
    .order('data_date', { ascending: false })
    .limit(days)
  if (error) throw error
  const list = rows<MarketRow>(data)
  // 前端按日期升序使用，这里翻转回来
  return list.slice().reverse()
}

export async function upsertMarket(row: {
  data_date: string
  is_rest_day?: boolean
  whole_temp?: number | null
  tech_temp?: number | null
  dividend_temp?: number | null
  dividend_yield?: number | null
  pe_median?: number | null
  industries?: Array<{ name: string; pct: number }>
  note?: string | null
  turnover_cny?: number | null
  turnover_prev_cny?: number | null
  advancers?: number | null
  decliners?: number | null
  limit_up?: number | null
  limit_down?: number | null
}) {
  const { data, error } = await cloud.database
    .from('market_data')
    .upsert(row, { onConflict: 'data_date' })
    .select('*')
  if (error) throw error
  return (Array.isArray(data) ? data[0] : null) as unknown as MarketRow | null
}

export async function listExtremes(): Promise<Record<string, ExtremeRow>> {
  const { data, error } = await cloud.database.from('market_extreme').select('*')
  if (error) throw error
  const map: Record<string, ExtremeRow> = {}
  for (const row of rows<ExtremeRow>(data)) map[row.metric_type] = row
  return map
}

/** 依据已经有的逐日数据重算历史极值并写回 market_extreme */
export async function recomputeExtremes() {
  const all = await listMarket(3650)
  const defs: Array<{ key: string; label: string; unit: string; pick: (r: MarketRow) => number | null }> = [
    { key: 'whole_temp', label: '全网估值温度', unit: '°', pick: (r) => r.whole_temp },
    { key: 'tech_temp', label: '科技股估值温度', unit: '°', pick: (r) => r.tech_temp },
    { key: 'dividend_temp', label: '红利股估值温度', unit: '°', pick: (r) => r.dividend_temp },
    { key: 'dividend_yield', label: '红利平均股息率', unit: '%', pick: (r) => r.dividend_yield },
    { key: 'pe_median', label: '科技市盈率中位数', unit: 'PE-TTM', pick: (r) => r.pe_median },
  ]
  const payload = defs.map((def) => {
    let min = { v: Number.POSITIVE_INFINITY, d: '' }
    let max = { v: Number.NEGATIVE_INFINITY, d: '' }
    for (const row of all) {
      const v = def.pick(row)
      if (v === null || v === undefined) continue
      if (v < min.v) min = { v, d: row.data_date }
      if (v > max.v) max = { v, d: row.data_date }
    }
    return {
      metric_type: def.key,
      label: def.label,
      unit: def.unit,
      min_val: Number.isFinite(min.v) ? min.v : null,
      max_val: Number.isFinite(max.v) ? max.v : null,
      min_date: min.d || null,
      max_date: max.d || null,
      updated_at: new Date().toISOString(),
    }
  })
  const { error } = await cloud.database.from('market_extreme').upsert(payload, { onConflict: 'metric_type' })
  if (error) throw error
  return payload.length
}

export async function removeMarketRow(date: string) {
  const { error } = await cloud.database.from('market_data').delete().eq('data_date', date)
  if (error) throw error
}

/* ---------------- 留言板 ---------------- */

/**
 * 留言列表。
 *
 * ⚠️ 安全：`messages` 可能包含私密留言（含用户身份信息），已收回匿名读权限，
 * 改由服务端函数按身份返回——管理员拿全量、普通用户只拿「自己的 + 非私密的」。
 * 展示顺序：置顶优先，其次时间倒序（与原实现一致）。
 */
export async function listMessages(
  auth: SessionAuth,
  opts: { mineOnly?: boolean } = {},
): Promise<MessageRow[]> {
  const { data, error } = await rpcAny('app_read_messages', {
    p_uid: auth.uid,
    p_token: auth.token ?? '',
  })
  if (error) throw error
  let rows = (data ?? []) as MessageRow[]
  if (opts.mineOnly) rows = rows.filter((r) => r.user_id === auth.uid)
  return rows.sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at),
  )
}

export async function createMessage(row: {
  user_id: string
  author_name: string
  content: string
  is_anonymous: boolean
  is_private: boolean
}) {
  // 提交留言仍走直连 INSERT（学员只能写入，读不到别人的私密留言）
  const { error } = await cloud.database.from('messages').insert(row)
  if (error) throw error
}

/** 管理员：回复 / 置顶（走服务端校验的 RPC） */
export async function adminUpdateMessage(auth: SessionAuth, id: number, patch: Partial<MessageRow>) {
  const { error } = await rpcAny('app_admin_update_message', {
    p_uid: auth.uid,
    p_token: auth.token ?? '',
    p_id: id,
    p_reply: patch.reply ?? null,
    p_replied_at: patch.replied_at ?? null,
    p_pinned: typeof patch.pinned === 'boolean' ? patch.pinned : null,
  })
  if (error) throw error
}

/** 管理员：删除留言（走服务端校验的 RPC） */
export async function adminDeleteMessage(auth: SessionAuth, id: number) {
  const { error } = await rpcAny('app_admin_update_message', {
    p_uid: auth.uid,
    p_token: auth.token ?? '',
    p_id: id,
    p_delete: true,
  })
  if (error) throw error
}

/* ---------------- 交易规划 ---------------- */

export async function listPositions(ownerId: string): Promise<PositionRow[]> {
  return selectAll<PositionRow>((from, to) =>
    cloud.database
      .from('trade_position')
      .select('*')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
      .range(from, to),
  )
}

export async function addPosition(ownerId: string, row: Omit<PositionRow, 'id' | 'owner_id' | 'updated_at'>) {
  const { error } = await cloud.database
    .from('trade_position')
    .insert({ ...row, owner_id: ownerId, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function removePosition(id: number, ownerId: string) {
  const { data, error } = await cloud.database
    .from('trade_position')
    .delete()
    .eq('id', id)
    .eq('owner_id', ownerId)
    .select('id')
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) throw new Error('删除未生效，该记录可能不属于你')
}

export async function listTrades(ownerId: string): Promise<TradeRow[]> {
  return selectAll<TradeRow>((from, to) =>
    cloud.database
      .from('trade_history')
      .select('*')
      .eq('owner_id', ownerId)
      .order('traded_at', { ascending: false })
      .range(from, to),
  )
}

export async function addTrade(ownerId: string, row: Omit<TradeRow, 'id' | 'owner_id'>) {
  const { error } = await cloud.database.from('trade_history').insert({ ...row, owner_id: ownerId })
  if (error) throw error
}

export async function removeTrade(id: number, ownerId: string) {
  const { data, error } = await cloud.database
    .from('trade_history')
    .delete()
    .eq('id', id)
    .eq('owner_id', ownerId)
    .select('id')
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) throw new Error('删除未生效，该记录可能不属于你')
}

/* ---------------- 高级学员专区 ---------------- */

export async function listMaterials(): Promise<MaterialRow[]> {
  return selectAll<MaterialRow>((from, to) =>
    cloud.database.from('master_material').select('*').order('sort_order', { ascending: true }).range(from, to),
  )
}

export async function adminSaveMaterial(row: Partial<MaterialRow>) {
  const { error } = await cloud.database.from('master_material').insert(row)
  if (error) throw error
}

export async function adminUpdateMaterial(id: number, patch: Partial<MaterialRow>) {
  const { error } = await cloud.database.from('master_material').update(patch).eq('id', id)
  if (error) throw error
}

export async function adminDeleteMaterial(id: number) {
  const { data, error } = await cloud.database.from('master_material').delete().eq('id', id).select('id')
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) throw new Error('删除未生效：该资料可能已不存在')
}

export async function listHomework(): Promise<HomeworkRow[]> {
  return selectAll<HomeworkRow>((from, to) =>
    cloud.database.from('master_homework').select('*').order('published_at', { ascending: false }).range(from, to),
  )
}

export async function listMySubmits(userId: string): Promise<SubmitRow[]> {
  return selectAll<SubmitRow>((from, to) =>
    cloud.database
      .from('homework_submit')
      .select('*')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })
      .range(from, to),
  )
}

export async function listSubmits(homeworkId: number): Promise<SubmitRow[]> {
  return selectAll<SubmitRow>((from, to) =>
    cloud.database
      .from('homework_submit')
      .select('*')
      .eq('homework_id', homeworkId)
      .order('submitted_at', { ascending: false })
      .range(from, to),
  )
}

export async function submitHomework(row: {
  homework_id: number
  user_id: string
  user_name: string
  content: string
}) {
  const { error } = await cloud.database.from('homework_submit').insert(row)
  if (error) throw error
}

/** 管理员：发布或更新作业（row.id 存在即为更新） */
export async function saveHomeworkAdmin(row: Partial<HomeworkRow> & { title: string }): Promise<number> {
  const payload = {
    title: row.title,
    period: row.period ?? '',
    content: row.content ?? '',
    status: row.status ?? 'published',
    deadline: row.deadline ?? null,
    published_at: row.published_at ?? new Date().toISOString(),
  }
  if (row.id) {
    const { data, error } = await cloud.database
      .from('master_homework')
      .update(payload)
      .eq('id', row.id)
      .select('id')
    if (error) throw error
    if (!Array.isArray(data) || data.length === 0) throw new Error('保存未生效：该作业可能已不存在')
    return row.id
  }
  const { data, error } = await cloud.database.from('master_homework').insert(payload).select('id')
  if (error) throw error
  const id = Array.isArray(data) && data[0] ? (data[0] as { id: number }).id : NaN
  if (!Number.isFinite(id)) throw new Error('发布失败，请重试')
  return id
}

/** 管理员：删除作业（连同学员提交一并清理） */
export async function deleteHomeworkAdmin(id: number) {
  const { error: e1 } = await cloud.database.from('homework_submit').delete().eq('homework_id', id)
  if (e1) throw e1
  const { data, error } = await cloud.database.from('master_homework').delete().eq('id', id).select('id')
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) throw new Error('删除未生效：该作业可能已不存在')
}

/** 管理员：批改提交（评分 + 评语） */
export async function gradeSubmitAdmin(id: number, score: number | null, review: string | null) {
  const { data, error } = await cloud.database
    .from('homework_submit')
    .update({ score, review })
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) throw new Error('保存未生效：该提交可能已不存在')
}

/* ---------------- 换绑申请 ---------------- */

export async function createPhoneChange(row: {
  user_id?: string | null
  old_phone: string
  new_phone: string
  remark?: string
}) {
  const { error } = await cloud.database
    .from('phone_change')
    .insert({ ...row, status: 'pending', source: 'web' })
  if (error) throw error
}

export async function listPhoneChanges(): Promise<PhoneChangeRow[]> {
  return selectAll<PhoneChangeRow>((from, to) =>
    cloud.database.from('phone_change').select('*').order('created_at', { ascending: false }).range(from, to),
  )
}

export async function updatePhoneChange(id: number, patch: Partial<PhoneChangeRow>) {
  const { error } = await cloud.database.from('phone_change').update(patch).eq('id', id)
  if (error) throw error
}

/* ---------------- 订单 ---------------- */

/**
 * 学员下单（走服务端函数）。
 *
 * ⚠️ 为什么不能直连插入：`insert().select('id')` 需要 **INSERT + SELECT** 两项权限，
 * 而安全改造已收回 orders 的 SELECT —— 用户真实下单时会报
 * `permission denied for table orders`（这正是线上用户反馈的报错根因）。
 * 改为 RPC 后由服务端一次完成：校验令牌与参数、**价格由服务端决定**（不信任前端传值）、
 * 强制 `status='pending'`，并直接返回新订单 id。
 */
export async function createOrder(
  auth: SessionAuth,
  row: {
    phone: string
    nickname?: string | null
    product_type: string
    /** 购买份数（服务端会把金额与应发天数按份数相乘，并限制在 1~24） */
    quantity?: number
    remark?: string | null
  },
): Promise<number | null> {
  const { data, error } = await rpcAny('app_create_order', {
    p_uid: auth.uid,
    p_token: auth.token ?? '',
    p_phone: row.phone,
    p_nickname: row.nickname ?? null,
    p_product_type: row.product_type,
    p_quantity: row.quantity ?? 1,
    p_remark: row.remark ?? null,
  })
  if (error) throw error
  const id = typeof data === 'number' ? data : Array.isArray(data) ? Number(data[0]) : NaN
  return Number.isFinite(id) ? id : null
}

/** 调用受保护数据 RPC 所需的服务端凭据（登录时签发，见 auth.ts 的 AccountSession） */
export interface SessionAuth {
  uid: string
  token: string | null
}

/** SDK 的 rpc 泛型不做行类型推断，这里按实际返回形态断言一次 */
const rpcAny = cloud.database.rpc as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>

/**
 * 订单列表（仅管理员）。
 *
 * ⚠️ 安全：`orders` 含用户手机号明文，已**收回匿名角色的读权限**，
 * 改走 SECURITY DEFINER 函数由服务端校验管理员 token 后才返回，避免凭公开 key 直接拉表。
 */
export async function listOrdersAdmin(auth: SessionAuth): Promise<OrderRow[]> {
  const { data, error } = await rpcAny('app_admin_list_orders', {
    p_uid: auth.uid,
    p_token: auth.token ?? '',
  })
  if (error) throw error
  return (data ?? []) as OrderRow[]
}

/**
 * 读取套餐价格（公开，无需登录）。
 *
 * 价格以服务端 `plan_config` 表为准 —— 后台改价后**前端展示与下单金额同时变化**，
 * 不需要改代码重新发布（此前价格硬编码在 site.ts 与函数里，两处都得改）。
 */
export async function readPrices(): Promise<Record<string, number>> {
  const { data, error } = await rpcAny('app_read_prices', {})
  if (error) throw error
  const out: Record<string, number> = {}
  ;((data ?? []) as Array<{ product_type: string; price: number | string }>).forEach((r) => {
    out[r.product_type] = Number(r.price)
  })
  return out
}

/** 管理员：调整套餐单价（仅影响之后的新订单，历史订单金额保持不变） */
export async function adminSetPrice(
  auth: SessionAuth,
  productType: string,
  price: number,
): Promise<void> {
  const { error } = await rpcAny('app_admin_set_price', {
    p_uid: auth.uid,
    p_token: auth.token ?? '',
    p_product_type: productType,
    p_price: price,
  })
  if (error) throw error
}

/**
 * 确认收款（仅管理员）——**一步完成「改状态 + 发权益」**。
 *
 * 背景：原先确认订单只改状态，权益要管理员再到「用户与权益」手动发放，
 * 两步人工操作一旦漏掉第二步，用户付款后权益不到账（客诉风险）。
 * 现由服务端在同一函数内完成：改状态为 confirmed 并按订单产品发放/顺延权益
 * （学员 +30 天、高级学员 +90 天，从「当前到期日与今天取较大者」起算），
 * 且**只对 pending 订单发放**，避免重复点击导致重复顺延。
 */
export async function confirmOrderAdmin(
  auth: SessionAuth,
  orderId: number,
  grant = true,
): Promise<{ granted: boolean; memberExpireAt: string | null; masterExpireAt: string | null }> {
  const { data, error } = await rpcAny('app_admin_confirm_order', {
    p_uid: auth.uid,
    p_token: auth.token ?? '',
    p_order_id: orderId,
    p_grant: grant,
  })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : null) as
    | { granted?: boolean; member_expire_at?: string | null; master_expire_at?: string | null }
    | null
  return {
    granted: Boolean(row?.granted),
    memberExpireAt: row?.member_expire_at ?? null,
    masterExpireAt: row?.master_expire_at ?? null,
  }
}

/** 订单状态变更（仅管理员）：取消 / 恢复（确认请用 confirmOrderAdmin，以便同时发放权益） */
export async function updateOrderAdmin(
  auth: SessionAuth,
  id: number,
  status: string,
  confirmedAt: string | null,
): Promise<void> {
  const { error } = await rpcAny('app_admin_update_order', {
    p_uid: auth.uid,
    p_token: auth.token ?? '',
    p_id: id,
    p_status: status,
    p_confirmed_at: confirmedAt,
  })
  if (error) throw error
}

/* ---------------- 市盈率 PE-TTM ---------------- */

/**
 * 指数日频 PE-TTM。
 *
 * `opts.since`/`until` 为可选的日期区间（YYYY-MM-DD）：页面首屏只取最近一年的窗口，
 * 切到「近 3 年 / 全部」时再拉全量（不传参 = 全量，保持原有行为）。
 *
 * 注意：**不要改成 `.order(desc).limit(N)` 取「最近 N 行」**——云库单次查询有 1000 行
 * 硬上限且静默截断，`limit` 传再大也没用，必须靠 `.gte()` 缩小范围 + selectAll 分页。
 * 分页还必须带**稳定排序**（pe_date + index_code），否则同一天多指数跨页会重复或漏行。
 */
export async function listPeIndex(opts: { since?: string; until?: string } = {}): Promise<PeIndexRow[]> {
  return selectAll<PeIndexRow>((from, to) => {
    let q = cloud.database
      .from('pe_index')
      .select('index_code,index_name,pe_date,pe_ttm,close_price,kind,source')
      .order('pe_date', { ascending: true })
      .order('index_code', { ascending: true })
    if (opts.since) q = q.gte('pe_date', opts.since)
    if (opts.until) q = q.lte('pe_date', opts.until)
    return q.range(from, to)
  })
}

/**
 * 历史 PE 极值表（pe_extreme，仅 67 行：4 指数 + 33 地域 + 30 行业）。
 *
 * 这张表由每交易日收盘后的任务按「当日值 vs 已存极值」增量维护，前端表格直接读它即可
 * 拿到「历史最低/最高位」，**无需再拉全量历史现算**（那是首屏最大的一笔开销）。
 * 已核验：其极值与 pe_index 全量聚合结果逐指数完全一致。
 */
export async function listPeExtreme(): Promise<PeExtremeRow[]> {
  const { data, error } = await cloud.database.from('pe_extreme').select('*')
  if (error) throw error
  return (data ?? []) as PeExtremeRow[]
}

/** 数据缺口备注（pe_data_gap，极少行）。前端据此把缺口标注为「区间值为负数」或「数据缺失」 */
export async function listPeDataGap(): Promise<PeDataGapRow[]> {
  const { data, error } = await cloud.database
    .from('pe_data_gap')
    .select('id,kind,target_code,target_name,gap_from,gap_to,reason,verified,note')
  if (error) throw error
  return (data ?? []) as PeDataGapRow[]
}

/** 板块（地域/行业）日频 PE 历史序列——按单个板块按需查询，避免一次拉 2 万+ 行 */
export async function listPeIndustryDaily(
  kind: 'region' | 'industry',
  code: string,
  opts: { since?: string } = {},
): Promise<PeIndustryDailyRow[]> {
  return selectAll<PeIndustryDailyRow>((from, to) => {
    let q = cloud.database
      .from('pe_industry_daily')
      .select('industry_code,industry_name,kind,pe_date,pe_ttm')
      .eq('kind', kind)
      .eq('industry_code', code)
      .order('pe_date', { ascending: true })
    if (opts.since) q = q.gte('pe_date', opts.since)
    return q.range(from, to)
  })
}

export async function upsertPeIndex(
  payload: Array<{ index_code: string; index_name: string; pe_date: string; pe_ttm: number; close_price?: number | null; kind?: string }>,
) {
  const { error } = await cloud.database
    .from('pe_index')
    .upsert(payload, { onConflict: 'index_code,pe_date' })
  if (error) throw error
}

export async function listPeIndustry(kind: 'region' | 'industry' = 'region'): Promise<PeIndustryRow[]> {
  return selectAll<PeIndustryRow>((from, to) =>
    cloud.database
      .from('pe_industry')
      .select('*')
      .eq('kind', kind)
      .order('industry_code', { ascending: true })
      .range(from, to),
  )
}

export async function updatePeIndustry(code: string, patch: Partial<PeIndustryRow>) {
  const { error } = await cloud.database
    .from('pe_industry')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('industry_code', code)
  if (error) throw error
}

/** 更新某行业当日 PE 时同步维护历史最低：新值更低则覆盖 */
export async function upsertPeIndustryValue(code: string, pe: number | null, peDate: string) {
  const { data, error } = await cloud.database
    .from('pe_industry')
    .select('hist_min_pe')
    .eq('industry_code', code)
    .maybeSingle()
  if (error) throw error
  const current = (data as unknown as { hist_min_pe: number | null } | null)?.hist_min_pe ?? null
  const nextMin = pe === null ? current : current === null ? pe : Math.min(current, pe)
  await updatePeIndustry(code, {
    pe_ttm: pe,
    pe_date: peDate,
    hist_min_pe: nextMin,
    hist_min_date: pe !== null && (current === null || pe <= current) ? peDate : undefined,
  } as Partial<PeIndustryRow>)
}

/* ---------------- A股温度计 ---------------- */

/** 最近一次温度快照（market_temp 按日期倒序取第一条；含近一年历史曲线） */
export async function listMarketTemp(): Promise<MarketTempRow | null> {
  const { data, error } = await cloud.database
    .from('market_temp')
    .select('*')
    .order('as_of_date', { ascending: false })
    .limit(1)
  if (error) throw error
  return rows<MarketTempRow>(data)[0] ?? null
}

/**
 * 温度计**全量历史明细**（market_temp_history，2018-11-08 起，约 1900+ 个交易日）。
 *
 * 首页快照里的 series 只保留近一年（250 个交易日）以保证加载速度；
 * 走势图把时间段切到更长区间时，改为按需查询这张明细表（可选 since 缩小范围）。
 */
export async function listMarketTempHistory(opts: { since?: string } = {}): Promise<MarketTempHistoryRow[]> {
  return selectAll<MarketTempHistoryRow>((from, to) => {
    let q = cloud.database
      .from('market_temp_history')
      .select('trade_date,temperature,label,momentum,volume,volatility,risk_appetite,style,breadth,margin')
      .order('trade_date', { ascending: true })
    if (opts.since) q = q.gte('trade_date', opts.since)
    return q.range(from, to)
  })
}

/* ---------------- 高级学员课程回放 ---------------- */

export async function listCourseVideos(onlyPublished = true): Promise<CourseVideoRow[]> {
  let builder = cloud.database.from('course_video').select('*')
  return selectAll<CourseVideoRow>((from, to) => {
    let builder = cloud.database.from('course_video').select('*')
    if (onlyPublished) builder = builder.eq('published', true)
    return builder
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .range(from, to)
  })
}

export async function adminSaveCourseVideo(row: Partial<CourseVideoRow> & { title: string; url: string }) {
  if (row.id) {
    const { id, ...patch } = row
    const { error } = await cloud.database.from('course_video').update(patch).eq('id', id)
    if (error) throw error
    return id
  }
  const { data, error } = await cloud.database.from('course_video').insert(row).select('id')
  if (error) throw error
  return Array.isArray(data) && data[0] ? (data[0] as { id: number }).id : null
}

export async function adminDeleteCourseVideo(id: number) {
  const { data, error } = await cloud.database.from('course_video').delete().eq('id', id).select('id')
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) throw new Error('删除未生效：该回放可能已不存在')
}

/* ---------------- 企业研究表 ---------------- */

/** 本地日期 YYYY-MM-DD（避免 toISOString 的 UTC 跨日偏差） */
function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export async function listCompanyResearch(): Promise<CompanyResearchRow[]> {
  return selectAll<CompanyResearchRow>((from, to) =>
    cloud.database
      .from('company_research')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )
}

/**
 * 智库指数：企业研究表成分股等权日涨跌幅累乘指数（基点 1000，按日期升序）
 *
 * ⚠️ 必须分页拉全量：云服务端对单次查询有默认行数上限（1000）。本函数若不带 limit 直接
 * 按 trade_date 升序查询，返回的只是**最早的 1000 个交易日**（实测最新只到 2024-08-09），
 * 而每日定时任务新写入的数据排在末尾、永远落在这 1000 行之外 —— 表现为「定时任务更新成功，
 * 但前端走势图纹丝不动」。这里按页循环取到不足一页为止，保证历史与最新数据都完整。
 */
export async function listThinktankIndex(): Promise<ThinktankIndexRow[]> {
  return selectAll<ThinktankIndexRow>((from, to) =>
    cloud.database.from('thinktank_index').select('*').order('trade_date', { ascending: true }).range(from, to),
  )
}

export async function adminSaveCompanyResearch(
  row: Partial<CompanyResearchRow> & { name: string },
) {
  // 数据更新时间随保存自动刷新（任何字段变更都视为一次数据更新）
  const today = todayISO()
  if (row.id) {
    const { id, ...patch } = row
    patch.updated_date = today
    const { data, error } = await cloud.database
      .from('company_research')
      .update(patch)
      .eq('id', id)
      .select('id')
    if (error) throw error
    if (!Array.isArray(data) || data.length === 0) throw new Error('保存未生效：该企业可能已不存在')
    return id
  }
  const { data, error } = await cloud.database
    .from('company_research')
    .insert({ ...row, updated_date: today })
    .select('id')
  if (error) throw error
  return Array.isArray(data) && data[0] ? (data[0] as { id: number }).id : null
}

/** 批量导入：一次插入多行 */
export async function adminImportCompanyResearch(items: Array<Partial<CompanyResearchRow>>) {
  if (!items.length) return 0
  // 数据更新时间统一记为导入当天
  const today = todayISO()
  const payload = items.map((r) => ({ ...r, updated_date: today }))
  const { data, error } = await cloud.database.from('company_research').insert(payload).select('id')
  if (error) throw error
  return Array.isArray(data) ? data.length : 0
}

export async function adminDeleteCompanyResearch(id: number) {
  const { data, error } = await cloud.database.from('company_research').delete().eq('id', id).select('id')
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) throw new Error('删除未生效：该企业可能已不存在')
}

/** 清空企业研究表（重新整体导入前使用） */
export async function adminClearCompanyResearch() {
  const { error } = await cloud.database.from('company_research').delete().gte('id', 0)
  if (error) throw error
}
