import { Link, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { Card, Disclaimer, PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/ui'
import { useCachedResource } from '../lib/useCachedResource'
import { cacheKey } from '../services/cache'
import { valuateLive, type LiveValuation } from '../services/valuateLive'
import { cn } from '../lib/utils'
import {
  BASIS_LABELS,
  DIM_HINTS,
  DIM_LABELS,
  DIM_ORDER,
  barTone,
  clampScore,
  fmtByUnit,
  scoreTone,
} from '../lib/dimDetail'
import type { StockValuationDimDetail } from '../lib/types'

/**
 * 六维明细（独立页，/member/valuation/:code/dims）
 *
 * 为什么从「卡片内展开」改成独立页
 *   侧栏只有 340px 宽，六个维度全展开要拉出 1500px 长条，把估值区间、排雷、
 *   模型参数全顶到屏幕外，读起来像一张被拉长的收据。明细本质是一张表
 *   （指标 × 数值 × 得分 × 条形），需要宽度，不适合挤在侧栏里。
 *
 * 表格只留四列（2026-10-22）
 *   原先还有「同业中位」「权重」两列，六列在 390px 手机上一行塞不下，
 *   整张表被撑到 420px 触发横向滚动，六张表要横着拖才能看全。
 *   两列的可读性收益远小于横向滚动带来的损失，故删除：
 *     · 同业中位 → 并入指标名下方的小字与 title（悬停可见），不再单列
 *     · 权重     → 维度级权重仍在卡头「占总分 xx%」，指标级权重不再展示
 *
 * 数据来源
 *   与批量页/详情页同一个缓存键 `live-valuation:<code>`（5 分钟），
 *   所以从估值卡点进来不会重新算——直接复用刚算出的那一行。
 */

const DISCLAIMER =
  '六维评分为量化模型按同业分位与绝对阈值计算的结果，同业样本取自证监会行业分类，' +
  '不构成任何投资建议；指标口径与阈值见《企业评价与估值体系设计》§2.2。'

/** 单个维度的明细卡：一张小表 + 维度得分 */
function DimSection({
  dimKey,
  detail,
}: {
  dimKey: string
  detail: StockValuationDimDetail
}) {
  const items = detail.items ?? []
  const missing = items.filter((it) => it.score === null).length
  const label = DIM_LABELS[dimKey] ?? dimKey

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="serif text-[16px] text-mist-100">{label}</h2>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-mist-700">{DIM_HINTS[dimKey]}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn('serif text-[26px] leading-none', scoreTone(detail.score))}>
            {detail.score === null ? '—' : detail.score.toFixed(1)}
          </p>
          <p className="mt-1 text-[10.5px] text-mist-700">占总分 {Math.round(detail.weight * 100)}%</p>
        </div>
      </div>

      {missing > 0 ? (
        <p className="mb-2 rounded border border-gold/20 bg-gold/5 px-2 py-1 text-[10.5px] leading-snug text-gold-soft">
          {missing === items.length
            ? '该维度指标全部缺失（常见于金融等行业口径不适用），未计入总分'
            : `${missing}/${items.length} 项缺数据，维度得分由其余项归一计算`}
        </p>
      ) : null}

      <table data-dim={dimKey} className="w-full table-fixed text-[12px]">
        <colgroup>
          <col />
          <col className="w-[74px]" />
          <col className="w-[46px]" />
          <col className="w-[52px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-ink-800 text-[10.5px] text-mist-700">
            <th className="py-1.5 pr-2 text-left font-normal">指标</th>
            <th className="px-1.5 py-1.5 text-right font-normal">数值</th>
            <th className="px-1.5 py-1.5 text-right font-normal">得分</th>
            <th className="py-1.5 pl-1.5" />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const s = clampScore(it.score)
            const peerText =
              it.basis === 'peer'
                ? ` · 样本 ${it.peer_n ?? 0}${
                    it.peer_median === null || it.peer_median === undefined
                      ? ''
                      : ` · 中位 ${fmtByUnit(it.peer_median, it.unit)}`
                  }`
                : ''
            return (
              <tr key={it.key} className="border-b border-ink-850/70 last:border-0">
                <td
                  className="py-1.5 pr-2 text-mist-300"
                  title={`${it.label}｜${BASIS_LABELS[it.basis]}${peerText}${
                    it.note ? ` · ${it.note}` : ''
                  }`}
                >
                  <span className="block truncate">{it.label}</span>
                  <span className="block truncate text-[10px] text-mist-700">
                    {BASIS_LABELS[it.basis]}
                    {it.basis === 'peer' && it.peer_n !== null ? ` · 样本 ${it.peer_n}` : ''}
                    {it.note ? ` · ${it.note}` : ''}
                  </span>
                </td>
                <td className="whitespace-nowrap px-1.5 py-1.5 text-right text-mist-100">
                  {fmtByUnit(it.value, it.unit)}
                </td>
                <td className={cn('px-1.5 py-1.5 text-right', scoreTone(it.score))}>
                  {it.score === null ? '—' : it.score.toFixed(1)}
                </td>
                <td className="py-1.5 pl-1.5">
                  <span className="block h-1.5 w-full overflow-hidden rounded-full bg-ink-850">
                    <span
                      className={cn('block h-full rounded-full', barTone(s))}
                      style={{ width: `${s ?? 0}%` }}
                    />
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

export function ValuationDimsPage() {
  const { code = '' } = useParams<{ code: string }>()

  const res = useCachedResource<LiveValuation>(
    code ? cacheKey('live-valuation', code) : null,
    () => valuateLive(code),
    { ttlMs: 5 * 60 * 1000 },
  )
  const row = res.data

  const backLink = (
    <Link
      to="/member/valuation"
      className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-mist-500 transition hover:text-gold-soft"
    >
      <ArrowLeft size={13} /> 返回估值实验室
    </Link>
  )

  if (res.loading && !row) {
    return (
      <div>
        {backLink}
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
        {backLink}
        <EmptyState
          title={res.error ? '计算失败' : '未找到该股票'}
          desc={res.error || '请确认代码是否正确（6 位数字）。'}
        />
        <p className="mt-3 text-center text-[11.5px] text-mist-700">
          <AlertCircle size={11} className="mr-1 inline" />
          若只是计算服务未启动，请在 stock_value_estimator-main 目录运行
          <code className="mx-1 rounded bg-ink-850 px-1 py-0.5">python api/server.py --port 8787</code>
        </p>
      </div>
    )
  }

  const detail = row.dim_detail
  const hasDetail = Boolean(detail && Object.keys(detail).length)

  return (
    <div>
      {backLink}

      <PageHeader
        eyebrow="量化估值 · 六维明细"
        title={row.name}
        desc={[
          row.code,
          row.industry ?? '行业未标注',
          `${row.mode ?? '—'} × ${row.stage ?? '—'}`,
        ].join('　·　')}
        right={
          <div className="text-right">
            <p className="leading-none">
              <span className="serif text-[32px] text-mist-100">
                {row.score_total === null ? '—' : row.score_total.toFixed(1)}
              </span>
              <span
                className={cn(
                  'ml-1.5 rounded px-1.5 py-0.5 text-[12px]',
                  row.grade === 'A'
                    ? 'bg-up/10 text-up'
                    : row.grade === 'B'
                      ? 'bg-gold/10 text-gold-soft'
                      : row.grade === 'C'
                        ? 'bg-ink-850 text-mist-400'
                        : 'bg-down/10 text-down',
                )}
              >
                {row.grade ?? '—'}
              </span>
            </p>
            <p className="mt-1 text-[11.5px] text-mist-700">
              现价 {row.price?.toFixed(2) ?? '—'}　PE {row.pe?.toFixed(2) ?? '—'}
            </p>
            <Link
              to={`/member/valuation/${row.code}`}
              className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] text-gold-soft transition hover:text-gold"
            >
              查看完整估值详情 <ArrowRight size={11} />
            </Link>
          </div>
        }
      />

      {!hasDetail ? (
        <EmptyState
          title="该样本没有六维明细"
          desc="明细随实时计算返回，历史存档行不含该字段。请在估值实验室里重新计算一次。"
        />
      ) : (
        <>
          {/* 总览：一屏看清哪一维拖后腿 */}
          <Card className="mb-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="serif text-[16px] text-mist-100">六维总览</h2>
              <p className="text-[11px] text-mist-700">条长为得分，右侧百分比为该维度占总分权重</p>
            </div>
            <div className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
              {DIM_ORDER.map((key) => {
                const d = detail?.[key]
                const s = clampScore(d?.score ?? row.dims?.[key])
                return (
                  <div key={key} className="flex items-center gap-2.5">
                    <span className="w-10 shrink-0 text-[12px] text-mist-500">{DIM_LABELS[key]}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-850">
                      <span
                        className={cn('block h-full rounded-full', barTone(s))}
                        style={{ width: `${s ?? 0}%` }}
                      />
                    </span>
                    <span className="serif w-11 shrink-0 text-right text-[12.5px] text-mist-300">
                      {s === null ? '—' : s.toFixed(1)}
                    </span>
                    <span className="w-9 shrink-0 text-right text-[10.5px] text-mist-700">
                      {d ? `${Math.round(d.weight * 100)}%` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* 逐维明细：两列排布，每维一张小表 */}
          <div className="grid gap-4 lg:grid-cols-2">
            {DIM_ORDER.map((key) =>
              detail?.[key] ? (
                <DimSection key={key} dimKey={key} detail={detail[key]} />
              ) : null,
            )}
          </div>

          <p className="mt-3 rounded-xl border border-ink-700 bg-ink-900/60 px-3.5 py-2.5 text-[11px] leading-relaxed text-mist-700">
            维度得分 = 该维度下各指标得分的加权平均（缺项自动跳过、权重重新归一）。
            每行的「得分」是该指标在 0–100 分标尺上的位置；指标名下方标的是它的打分口径——
            阈值锚点看绝对水平，同业分位看行业内相对位置，同一只股票两种口径可能给出不同结论。
            同业中位数不单独占列，桌面端把鼠标移到指标名上可见。
          </p>

          <Disclaimer text={DISCLAIMER} />
        </>
      )}
    </div>
  )
}
