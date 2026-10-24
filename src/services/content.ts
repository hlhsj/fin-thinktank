/**
 * 内容服务层（v2 重构：薄客户端）。
 *
 * 与 v1 的区别：v1 在这里直接用云数据库 SDK 拼查询（浏览器持有公开 key）；
 * v2 全部改为调用同源 `/api/rpc/{method}`，由 Python 后端鉴权、缓存、分页与聚合。
 * **函数签名与返回类型保持不变**，页面与组件无需改动。
 */
import { call, type SessionAuth } from './api'
import type {
  CaseRow,
  ChapterRow,
  CompanyResearchRow,
  CourseVideoRow,
  ExtremeRow,
  GlossaryRow,
  HomeworkRow,
  MarketRow,
  MarketSummary,
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
  MarketSummary,
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

export type { SessionAuth }

/* ---------------- 学习资料库 ---------------- */

export async function listChapters(auth: SessionAuth): Promise<ChapterRow[]> {
  return call<ChapterRow[]>('listChapters', { auth })
}

export async function saveChapterAdmin(
  auth: SessionAuth,
  row: Partial<ChapterRow> & { title: string },
): Promise<number> {
  return call<number>('saveChapterAdmin', { auth, row })
}

export async function deleteChapterAdmin(auth: SessionAuth, id: number) {
  await call('deleteChapterAdmin', { auth, id })
}

export async function listGlossary(keyword?: string): Promise<GlossaryRow[]> {
  return call<GlossaryRow[]>('listGlossary', { keyword })
}

export async function saveGlossary(row: Partial<GlossaryRow> & { term: string }) {
  await call('saveGlossary', { row })
}

export async function updateGlossary(id: number, patch: Partial<GlossaryRow>) {
  await call('updateGlossary', { id, patch })
}

export async function deleteGlossary(id: number) {
  await call('deleteGlossary', { id })
}

/* ---------------- 复盘文档库 ---------------- */

export async function listReviews(): Promise<ReviewRow[]> {
  return call<ReviewRow[]>('listReviews')
}

export async function getReview(id: number): Promise<ReviewRow | null> {
  return call<ReviewRow | null>('getReview', { id })
}

export async function saveReview(row: Partial<ReviewRow> & { title: string; week_no: number }) {
  await call('saveReview', { row })
}

export async function updateReview(id: number, patch: Partial<ReviewRow>) {
  await call('updateReview', { id, patch })
}

export async function deleteReview(id: number) {
  await call('deleteReview', { id })
}

/* ---------------- 经典案例分析 ---------------- */

export async function listCases(): Promise<CaseRow[]> {
  return call<CaseRow[]>('listCases')
}

export async function getCase(id: number): Promise<CaseRow | null> {
  return call<CaseRow | null>('getCase', { id })
}

export async function saveCase(row: Partial<CaseRow> & { title: string }) {
  await call('saveCase', { row })
}

export async function updateCase(id: number, patch: Partial<CaseRow>) {
  await call('updateCase', { id, patch })
}

export async function deleteCase(id: number) {
  await call('deleteCase', { id })
}

/* ---------------- 市场数据（旧表，保留兼容） ---------------- */

export async function listMarket(days = 120): Promise<MarketRow[]> {
  return call<MarketRow[]>('listMarket', { days })
}

export async function upsertMarket(row: Record<string, unknown>): Promise<MarketRow | null> {
  return call<MarketRow | null>('upsertMarket', { row })
}

export async function listExtremes(): Promise<Record<string, ExtremeRow>> {
  return call<Record<string, ExtremeRow>>('listExtremes')
}

export async function recomputeExtremes(): Promise<number> {
  return call<number>('recomputeExtremes')
}

export async function removeMarketRow(date: string) {
  await call('removeMarketRow', { date })
}

/* ---------------- 留言板 ---------------- */

export async function listMessages(
  auth: SessionAuth,
  opts: { mineOnly?: boolean } = {},
): Promise<MessageRow[]> {
  return call<MessageRow[]>('listMessages', { auth, mineOnly: opts.mineOnly })
}

export async function createMessage(row: {
  user_id: string
  author_name: string
  content: string
  is_anonymous: boolean
  is_private: boolean
}) {
  await call('createMessage', { row })
}

export async function adminUpdateMessage(auth: SessionAuth, id: number, patch: Partial<MessageRow>) {
  await call('adminUpdateMessage', { auth, id, patch })
}

export async function adminDeleteMessage(auth: SessionAuth, id: number) {
  await call('adminDeleteMessage', { auth, id })
}

/* ---------------- 交易记录（学员私有） ---------------- */

export async function listPositions(ownerId: string): Promise<PositionRow[]> {
  return call<PositionRow[]>('listPositions', { ownerId })
}

export async function addPosition(
  ownerId: string,
  row: Omit<PositionRow, 'id' | 'owner_id' | 'updated_at'>,
) {
  await call('addPosition', { ownerId, row })
}

export async function removePosition(id: number, ownerId: string) {
  await call('removePosition', { id, ownerId })
}

export async function listTrades(ownerId: string): Promise<TradeRow[]> {
  return call<TradeRow[]>('listTrades', { ownerId })
}

export async function addTrade(ownerId: string, row: Omit<TradeRow, 'id' | 'owner_id'>) {
  await call('addTrade', { ownerId, row })
}

export async function removeTrade(id: number, ownerId: string) {
  await call('removeTrade', { id, ownerId })
}

/* ---------------- 高级学员专区 ---------------- */

export async function listMaterials(): Promise<MaterialRow[]> {
  return call<MaterialRow[]>('listMaterials')
}

export async function adminSaveMaterial(row: Partial<MaterialRow>) {
  await call('adminSaveMaterial', { row })
}

export async function adminUpdateMaterial(id: number, patch: Partial<MaterialRow>) {
  await call('adminUpdateMaterial', { id, patch })
}

export async function adminDeleteMaterial(id: number) {
  await call('adminDeleteMaterial', { id })
}

export async function listHomework(): Promise<HomeworkRow[]> {
  return call<HomeworkRow[]>('listHomework')
}

export async function listMySubmits(userId: string): Promise<SubmitRow[]> {
  return call<SubmitRow[]>('listMySubmits', { userId })
}

export async function listSubmits(homeworkId: number): Promise<SubmitRow[]> {
  return call<SubmitRow[]>('listSubmits', { homeworkId })
}

export async function submitHomework(row: {
  homework_id: number
  user_id: string
  user_name: string
  content: string
}) {
  await call('submitHomework', { row })
}

export async function saveHomeworkAdmin(row: Partial<HomeworkRow> & { title: string }): Promise<number> {
  return call<number>('saveHomeworkAdmin', { row })
}

export async function deleteHomeworkAdmin(id: number) {
  await call('deleteHomeworkAdmin', { id })
}

export async function gradeSubmitAdmin(id: number, score: number | null, review: string | null) {
  await call('gradeSubmitAdmin', { id, score, review })
}

/* ---------------- 换绑申请 ---------------- */

export async function createPhoneChange(row: {
  user_id?: string | null
  old_phone: string
  new_phone: string
  remark?: string
}) {
  await call('createPhoneChange', { row })
}

export async function listPhoneChanges(): Promise<PhoneChangeRow[]> {
  return call<PhoneChangeRow[]>('listPhoneChanges')
}

export async function updatePhoneChange(id: number, patch: Partial<PhoneChangeRow>) {
  await call('updatePhoneChange', { id, patch })
}

/* ---------------- 订单 ---------------- */

export async function createOrder(
  auth: SessionAuth,
  row: {
    phone: string
    nickname?: string | null
    product_type: string
    quantity?: number
    remark?: string | null
  },
): Promise<number | null> {
  return call<number | null>('createOrder', { auth, row })
}

export async function listOrdersAdmin(auth: SessionAuth): Promise<OrderRow[]> {
  return call<OrderRow[]>('listOrdersAdmin', { auth })
}

export async function readPrices(): Promise<Record<string, number>> {
  return call<Record<string, number>>('readPrices')
}

export async function adminSetPrice(auth: SessionAuth, productType: string, price: number): Promise<void> {
  await call('adminSetPrice', { auth, productType, price })
}

export async function confirmOrderAdmin(
  auth: SessionAuth,
  orderId: number,
  grant = true,
): Promise<{ granted: boolean; memberExpireAt: string | null; masterExpireAt: string | null }> {
  return call('confirmOrderAdmin', { auth, orderId, grant })
}

export async function updateOrderAdmin(
  auth: SessionAuth,
  id: number,
  status: string,
  confirmedAt: string | null,
): Promise<void> {
  await call('updateOrderAdmin', { auth, id, status, confirmedAt })
}

/* ---------------- 市盈率 PE-TTM ---------------- */

export async function listPeIndex(opts: { since?: string; until?: string } = {}): Promise<PeIndexRow[]> {
  return call<PeIndexRow[]>('listPeIndex', { since: opts.since, until: opts.until })
}

export async function listPeExtreme(): Promise<PeExtremeRow[]> {
  return call<PeExtremeRow[]>('listPeExtreme')
}

export async function listPeDataGap(): Promise<PeDataGapRow[]> {
  return call<PeDataGapRow[]>('listPeDataGap')
}

export async function listPeIndustryDaily(
  kind: 'region' | 'industry',
  code: string,
  opts: { since?: string } = {},
): Promise<PeIndustryDailyRow[]> {
  return call<PeIndustryDailyRow[]>('listPeIndustryDaily', { kind, code, since: opts.since })
}

export async function upsertPeIndex(
  payload: Array<{
    index_code: string
    index_name: string
    pe_date: string
    pe_ttm: number
    close_price?: number | null
    kind?: string
  }>,
) {
  await call('upsertPeIndex', { payload })
}

export async function listPeIndustry(kind: 'region' | 'industry' = 'region'): Promise<PeIndustryRow[]> {
  return call<PeIndustryRow[]>('listPeIndustry', { kind })
}

export async function updatePeIndustry(code: string, patch: Partial<PeIndustryRow>) {
  await call('updatePeIndustry', { code, patch })
}

export async function upsertPeIndustryValue(code: string, pe: number | null, peDate: string) {
  await call('upsertPeIndustryValue', { code, pe, peDate })
}

/* ---------------- A股温度计 ---------------- */

export async function listMarketTemp(): Promise<MarketTempRow | null> {
  return call<MarketTempRow | null>('listMarketTemp')
}

/**
 * 市场页首屏聚合：温度计快照 + 指数窗口 + 历史极值（可选板块数据）。
 * 与分别调用 listMarketTemp/listPeIndex/listPeExtreme 结果完全一致，只是少两次往返。
 */
export async function getMarketSummary(
  opts: { since?: string; boards?: boolean } = {},
): Promise<MarketSummary> {
  return call<MarketSummary>('marketSummary', { since: opts.since, boards: opts.boards ?? false })
}

export async function listMarketTempHistory(
  opts: { since?: string } = {},
): Promise<MarketTempHistoryRow[]> {
  return call<MarketTempHistoryRow[]>('listMarketTempHistory', { since: opts.since })
}

/* ---------------- 高级学员课程回放 ---------------- */

export async function listCourseVideos(onlyPublished = true): Promise<CourseVideoRow[]> {
  return call<CourseVideoRow[]>('listCourseVideos', { onlyPublished })
}

export async function adminSaveCourseVideo(
  row: Partial<CourseVideoRow> & { title: string; url: string },
): Promise<number | null> {
  return call<number | null>('adminSaveCourseVideo', { row })
}

export async function adminDeleteCourseVideo(id: number) {
  await call('adminDeleteCourseVideo', { id })
}

/* ---------------- 企业研究表 ---------------- */

export async function listCompanyResearch(): Promise<CompanyResearchRow[]> {
  return call<CompanyResearchRow[]>('listCompanyResearch')
}

export async function listThinktankIndex(): Promise<ThinktankIndexRow[]> {
  return call<ThinktankIndexRow[]>('listThinktankIndex')
}

export async function adminSaveCompanyResearch(
  row: Partial<CompanyResearchRow> & { name: string },
): Promise<number | null> {
  return call<number | null>('adminSaveCompanyResearch', { row })
}

export async function adminImportCompanyResearch(
  items: Array<Partial<CompanyResearchRow>>,
): Promise<number> {
  return call<number>('adminImportCompanyResearch', { items })
}

export async function adminDeleteCompanyResearch(id: number) {
  await call('adminDeleteCompanyResearch', { id })
}

export async function adminClearCompanyResearch() {
  await call('adminClearCompanyResearch')
}
