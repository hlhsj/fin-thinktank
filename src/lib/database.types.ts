/**
 * ── 文件：src/lib/database.types.ts ─────────────────────────────
 * 功能：云数据库 schema 类型（29 张表）。传给 createWorkBuddyCloud<Database>() 后，
 *       from('表名') 才有行列级类型提示。
 * 改动指引：
 *   1. 新增表 → 这里加 xxx: Table<XxxRow>，并在 lib/types.ts 定义 XxxRow；
 *   2. 表加列 → 只改 lib/types.ts 的 Row，本文件不用动；
 *   3. 表改名 → 本文件与 services 里所有 from('旧表名') 要同步替换（全局搜索最稳）。
 */

import type {
  ArticleRow,
  AssetBlobRow,
  AssetRow,
  CaseRow,
  ChapterRow,
  CompanyResearchRow,
  CourseVideoRow,
  ExtremeRow,
  FavoriteRow,
  GlossaryRow,
  HomeworkRow,
  MarketRow,
  MarketTempHistoryRow,
  MarketTempRow,
  MessageRow,
  OrderRow,
  PeExtremeRow,
  PeIndexRow,
  PeIndustryDailyRow,
  PeIndustryRow,
  PhoneChangeRow,
  PlanItemRow,
  PositionRow,
  ReviewRow,
  MaterialRow,
  StudyPlanRow,
  SubmitRow,
  ThinktankIndexRow,
  TradeRow,
} from './types'

/**
 * 云数据库 schema 类型（对齐 supabase 的 createClient<Database>() 形态）。
 * 传给 createWorkBuddyCloud<Database>() 后，from('xxx') 具备行列级类型提示。
 */
type Table<Row> = {
  Row: Row
  Insert: Partial<Row>
  Update: Partial<Row>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      kb_articles: Table<ArticleRow>
      study_plans: Table<StudyPlanRow>
      plan_items: Table<PlanItemRow>
      favorites: Table<FavoriteRow>
      assets: Table<AssetRow>
      asset_blobs: Table<AssetBlobRow>
      doc_chapter: Table<ChapterRow>
      glossary: Table<GlossaryRow>
      review: Table<ReviewRow>
      case_video: Table<CaseRow>
      market_data: Table<MarketRow>
      market_extreme: Table<ExtremeRow>
      messages: Table<MessageRow>
      trade_position: Table<PositionRow>
      trade_history: Table<TradeRow>
      master_material: Table<MaterialRow>
      master_homework: Table<HomeworkRow>
      homework_submit: Table<SubmitRow>
      phone_change: Table<PhoneChangeRow>
      orders: Table<OrderRow>
      course_video: Table<CourseVideoRow>
      pe_index: Table<PeIndexRow>
      pe_industry: Table<PeIndustryRow>
      pe_industry_daily: Table<PeIndustryDailyRow>
      pe_extreme: Table<PeExtremeRow>
      thinktank_index: Table<ThinktankIndexRow>
      market_temp: Table<MarketTempRow>
      market_temp_history: Table<MarketTempHistoryRow>
      company_research: Table<CompanyResearchRow>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
