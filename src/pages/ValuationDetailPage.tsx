import { useParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react'
import { Disclaimer, PageHeader } from '../components/PageHeader'
import { ValuationResultView } from '../components/ValuationResultView'
import { ValuationRiskNotice } from '../components/ValuationRiskNotice'
import { EmptyState } from '../components/ui'
import { useCachedResource } from '../lib/useCachedResource'
import { cacheKey } from '../services/cache'
import { checkApi, valuateLive, type LiveValuation } from '../services/valuateLive'
import { cn } from '../lib/utils'
import { verdictLabel, verdictTone } from '../lib/valuation'

/**
 * 股票估值 · 单只详情（深链）
 *
 * 用途：把某只股票的结论做成可分享的链接（/member/valuation/600519）。
 * 数据来源与批量页一致——**实时计算**（本地 API），不再读云库预存表。
 * 因此链接任何时候打开都是当日最新数据，也不会因为跑批没覆盖就空着。
 */

const VALUATION_DISCLAIMER =
  '本页为量化估值模型的程序化输出（六维评价、经营模式判定、戈登/RIM/EV-EBITDA 多模型估值与情景期望收益），' +
  '模型参数与行业倍数含人工标定成分，结论仅用于学习与方法论研究，不构成任何投资建议。'

export function ValuationDetailPage() {
  const { code = '' } = useParams<{ code: string }>()

  const res = useCachedResource<LiveValuation>(
    code ? cacheKey('live-valuation', code) : null,
    () => valuateLive(code),
    // 实时结果只在会话内缓存 5 分钟：比后端 10 分钟短，手动刷新能看到新价
    { ttlMs: 5 * 60 * 1000 },
  )

  const row = res.data

  if (res.loading && !row) {
    return (
      <div>
        <Link
          to="/member/valuation"
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-mist-500 transition hover:text-gold-soft"
        >
          <ArrowLeft size={13} /> 返回估值实验室
        </Link>
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-ink-700 bg-ink-900 px-6 py-16">
          <Loader2 size={20} className="animate-spin text-gold" />
          <p className="text-[13.5px] text-mist-300">正在实时计算 {code}…</p>
          <p className="text-[12px] text-mist-700">取数 → 排雷 → 六维 → 估值 → 决策，约 3–6 秒</p>
        </div>
      </div>
    )
  }

  if (!row) {
    return (
      <div>
        <Link
          to="/member/valuation"
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-mist-500 transition hover:text-gold-soft"
        >
          <ArrowLeft size={13} /> 返回估值实验室
        </Link>
        <EmptyState
          title={res.error ? '计算失败' : '未找到该股票'}
          desc={
            res.error ||
            '请确认代码是否正确（6 位数字），或先在估值实验室里搜索名称确认。'
          }
        />
        <p className="mt-3 text-center text-[11.5px] text-mist-700">
          <AlertCircle size={11} className="mr-1 inline" />
          若只是本地计算服务未启动，请在 stock_value_estimator-main 目录运行
          <code className="mx-1 rounded bg-ink-850 px-1 py-0.5">python api/server.py --port 8787</code>
        </p>
      </div>
    )
  }

  const verdict = verdictLabel(row.verdict, row.rejected, row.avoid)

  return (
    <div>
      <Link
        to="/member/valuation"
        className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-mist-500 transition hover:text-gold-soft"
      >
        <ArrowLeft size={13} /> 返回估值实验室
      </Link>

      <PageHeader
        eyebrow={`量化估值 · ${row.code}`}
        title={`${row.name}${row.industry ? ` · ${row.industry}` : ''}`}
        desc={`${row.mode ?? '—'} × ${row.stage ?? '—'}${row.substage ? `（${row.substage}）` : ''}　·　现价 ${row.price ?? '—'}　·　PE ${row.pe ?? '—'}　·　PB ${row.pb ?? '—'}　·　实时计算${row._elapsed ? ` ${row._elapsed}s` : ''}`}
        right={
          <span
            className={cn(
              'inline-flex items-center rounded-xl border px-3 py-1.5 text-[13px]',
              verdictTone(row.verdict, row.rejected, row.avoid),
            )}
          >
            {verdict}
          </span>
        }
      />

      <ValuationRiskNotice />

      <ValuationResultView row={row} />

      <Disclaimer text={VALUATION_DISCLAIMER} />
    </div>
  )
}
