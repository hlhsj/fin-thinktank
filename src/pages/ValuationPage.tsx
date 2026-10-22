import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Calculator,
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Card, Disclaimer, PageHeader } from '../components/PageHeader'
import { ValuationResultView } from '../components/ValuationResultView'
import { ValuationRiskNotice } from '../components/ValuationRiskNotice'
import {
  checkApi,
  searchStocks,
  valuateLive,
  type LiveValuation,
  type SearchItem,
} from '../services/valuateLive'
import { cn } from '../lib/utils'
import { verdictLabel, verdictTone } from '../lib/valuation'

/**
 * 股票估值实验室 · 批量实时计算
 *
 * 交互定位：一次输入多只股票 → 逐只实时跑完整管线（L1 排雷 → L2 六维 →
 * L3 画像 → L4 估值 → L5 决策）→ 汇总成表，点任意一行展开该股全貌。
 *
 * 为什么不再展示「已算样本」：这个模块的用途是**批量算任意股票**，
 * 而不是查一张预存表。计算永远发生在源程序（stock_value_estimator-main）里，
 * 前端不复制任何估值逻辑。
 */

const VALUATION_DISCLAIMER =
  '本页为量化估值模型的程序化输出（六维评价、经营模式判定、戈登/RIM/EV-EBITDA 多模型估值与情景期望收益），' +
  '模型参数与行业倍数含人工标定成分，结论仅用于学习与方法论研究，不构成任何投资建议。'

/** 单次批量上限：每只约 3–6 秒，10 只 ≈ 1 分钟，再多等待体验就崩了 */
const MAX_BATCH = 10

const EXAMPLES = ['600519', '000651', '伊利股份']

function fmtNum(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(digits)
}

/** 把输入串拆成待算条目：支持逗号/空格/顿号/换行分隔 */
function parseInput(text: string): string[] {
  const parts = text
    .split(/[,，、\s\n\r\t]+/)
    .map((x) => x.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const k = p.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(p)
    if (out.length >= MAX_BATCH) break
  }
  return out
}

/* ---------------- 结果行（可展开） ---------------- */

function ResultRow({
  row,
  index,
  expanded,
  onToggle,
}: {
  row: LiveValuation
  index: number
  expanded: boolean
  onToggle: () => void
}) {
  const prem = row.fair_high && row.price > 0 ? row.price / row.fair_high - 1 : null
  return (
    <tr
      onClick={onToggle}
      className={cn(
        'cursor-pointer border-b border-ink-800/60 transition last:border-0',
        expanded ? 'bg-ink-850/60' : 'hover:bg-ink-850/40',
      )}
    >
      <td className="px-3 py-2.5 text-center text-[11px] text-mist-700">
        {expanded ? <ChevronUp size={13} className="inline text-gold" /> : <span>{index + 1}</span>}
      </td>
      <td className="px-3 py-2.5">
        <span className="font-medium text-mist-200">{row.name}</span>
        <span className="ml-2 text-[11.5px] text-mist-700">{row.code}</span>
      </td>
      <td className="px-3 py-2.5 text-[12.5px] text-mist-400">
        {row.mode ?? '—'}
        <span className="text-mist-700"> × </span>
        {row.stage ?? '—'}
        {row.substage ? <span className="text-[11px] text-gold/80">（{row.substage}）</span> : null}
      </td>
      <td className="px-3 py-2.5 text-right">
        {row.score_total !== null ? (
          <>
            <span className="serif text-[14.5px] text-mist-100">{row.score_total.toFixed(1)}</span>
            <span
              className={cn(
                'ml-1 rounded px-1 text-[11px]',
                row.grade === 'A'
                  ? 'bg-up/10 text-up'
                  : row.grade === 'B'
                    ? 'bg-gold/10 text-gold-soft'
                    : row.grade === 'C'
                      ? 'bg-ink-850 text-mist-400'
                      : 'bg-down/10 text-down',
              )}
            >
              {row.grade}
            </span>
          </>
        ) : (
          <span className="text-mist-700">—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className="rounded-md border border-ink-700 bg-ink-850 px-1.5 py-0.5 text-[11.5px] text-mist-300">
          {row.primary_model ?? (row.invalid ? '模型失效' : '—')}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right text-[12.5px] font-medium text-mist-200">
        {row.fair_low && row.fair_high ? `${fmtNum(row.fair_low)}–${fmtNum(row.fair_high)}` : '—'}
      </td>
      <td className="px-3 py-2.5 text-right">
        <span className="serif text-[13.5px] text-mist-100">{fmtNum(row.price)}</span>
        {prem !== null ? (
          <span
            className={cn(
              'ml-1 inline-flex items-center text-[11px]',
              prem > 0 ? 'text-up' : 'text-down',
            )}
          >
            {prem > 0 ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
            {prem > 0 ? '+' : '−'}
            {Math.abs(prem * 100).toFixed(1)}%
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2.5 text-right">
        <span
          className={cn(
            'inline-block rounded-lg border px-2 py-0.5 text-[11.5px]',
            verdictTone(row.verdict, row.rejected, row.avoid),
          )}
        >
          {verdictLabel(row.verdict, row.rejected, row.avoid)}
        </span>
      </td>
    </tr>
  )
}

function ResultCard({
  row,
  expanded,
  onToggle,
}: {
  row: LiveValuation
  expanded: boolean
  onToggle: () => void
}) {
  const prem = row.fair_high && row.price > 0 ? row.price / row.fair_high - 1 : null
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'block w-full rounded-xl border px-3.5 py-3 text-left transition',
        expanded ? 'border-gold/40 bg-ink-850' : 'border-ink-700 bg-ink-900 active:bg-ink-850',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate">
          <span className="text-[14px] font-medium text-mist-200">{row.name}</span>
          <span className="ml-1.5 text-[11px] text-mist-700">{row.code}</span>
        </span>
        <span
          className={cn(
            'shrink-0 rounded-md border px-1.5 py-0.5 text-[11px]',
            verdictTone(row.verdict, row.rejected, row.avoid),
          )}
        >
          {verdictLabel(row.verdict, row.rejected, row.avoid)}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] text-mist-500">
        {row.mode ?? '—'} × {row.stage ?? '—'}
        {row.substage ? <span className="text-gold/80">（{row.substage}）</span> : null}
      </p>
      <div className="mt-1.5 flex items-center justify-between text-[12px]">
        <span className="text-mist-400">
          六维{' '}
          {row.score_total !== null ? (
            <>
              <span className="serif text-mist-100">{row.score_total.toFixed(1)}</span>
              <span className="ml-1 text-mist-500">{row.grade}</span>
            </>
          ) : (
            '—'
          )}
        </span>
        <span className="text-mist-500">{row.primary_model ?? '—'}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[12px]">
        <span className="text-mist-400">
          区间{' '}
          <span className="text-mist-200">
            {row.fair_low && row.fair_high
              ? `${fmtNum(row.fair_low)}–${fmtNum(row.fair_high)}`
              : '—'}
          </span>
        </span>
        <span className="text-mist-400">
          现价 <span className="serif text-mist-100">{fmtNum(row.price)}</span>
          {prem !== null ? (
            <span className={cn('ml-1', prem > 0 ? 'text-up' : 'text-down')}>
              {prem > 0 ? '+' : '−'}
              {Math.abs(prem * 100).toFixed(1)}%
            </span>
          ) : null}
        </span>
      </div>
    </button>
  )
}

/* ---------------- 主页面 ---------------- */

/** 批量结果的会话级存档键（返回详情页后恢复用） */
const SESSION_KEY = 'valuation.batch.v1'

export function ValuationPage() {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<LiveValuation[]>([])
  const [failed, setFailed] = useState<Array<{ code: string; msg: string }>>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [current, setCurrent] = useState('')
  const [apiOk, setApiOk] = useState<boolean | null>(null)
  /** 正在探测（重试按钮据此显示「检测中…」） */
  const [apiChecking, setApiChecking] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  /** 输入联想：当前正在输入的片段（最后一个分隔符之后）的候选 */
  const [sug, setSug] = useState<SearchItem[]>([])
  const sugSeq = useRef(0)
  const detailRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef(false)

  /**
   * 探测计算服务。
   * 服务在云沙箱里，冷启动实测约 3.3 秒，所以 checkApi 内部会重试 3 次、单次超时 12 秒；
   * 失败后**不能锁死页面**——按钮仍可点，另给一个「重试」入口手动再探。
   */
  const probeApi = useCallback(async () => {
    setApiChecking(true)
    const ok = await checkApi()
    setApiOk(ok)
    setApiChecking(false)
  }, [])

  useEffect(() => {
    void probeApi()
  }, [probeApi])

  /** 本地开发（vite dev + 8787 代理）才提示启动命令；线上是同源单端口服务，提示重试即可 */
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)

  /**
   * 结果落 sessionStorage：点「查看六维明细」会卸载本页，回来时 state 已丢。
   * 只存本会话（关标签页即失效），不写云库——这里的目标是「一次算完一批」，不是维护样本清单。
   */
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as {
        text?: string
        rows?: LiveValuation[]
        expanded?: string | null
      }
      if (typeof saved.text === 'string' && saved.text) setText(saved.text)
      if (Array.isArray(saved.rows) && saved.rows.length) {
        setRows(saved.rows)
        setExpanded(saved.expanded ?? null)
      }
    } catch {
      // 存档损坏/隐私模式：按空页面处理，不影响计算
    }
  }, [])

  useEffect(() => {
    if (!restoredRef.current) return
    try {
      if (!text && !rows.length) sessionStorage.removeItem(SESSION_KEY)
      else sessionStorage.setItem(SESSION_KEY, JSON.stringify({ text, rows, expanded }))
    } catch {
      // 写不进去（隐私模式/配额满）就算了，功能不依赖它
    }
  }, [text, rows, expanded])

  const queued = useMemo(() => parseInput(text), [text])

  /**
   * 末段联想：只对「最后一个待输入片段」查候选。
   * 东财 suggest 原生支持代码 / 中文名 / 拼音首字母（gzmt → 贵州茅台），
   * 后端不用额外处理，这里只负责把候选摆到用户眼前。
   */
  useEffect(() => {
    if (running) {
      setSug([])
      return
    }
    const m = /([^\s,，、]+)$/.exec(text)
    const token = m ? m[1] : ''
    if (!token || /^\d{6}$/.test(token) || token.length > 12) {
      setSug([])
      return
    }
    const timer = window.setTimeout(async () => {
      const my = ++sugSeq.current
      try {
        const r = await searchStocks(token)
        if (my === sugSeq.current) setSug(r.slice(0, 6))
      } catch {
        if (my === sugSeq.current) setSug([])
      }
    }, 320)
    return () => window.clearTimeout(timer)
  }, [text, running])

  /** 点选候选：把末尾片段整体替换成 6 位代码，并补一个分隔符方便继续输入 */
  const applySug = (code: string) => {
    const m = /([^\s,，、]+)$/.exec(text)
    if (m) {
      setText(`${text.slice(0, text.length - m[1].length)}${code}, `)
    } else {
      const head = text.replace(/[,，、\s]+$/, '')
      setText(`${head}${head ? ', ' : ''}${code}, `)
    }
    setSug([])
  }

  /** 批量计算：逐只串行（后端也有锁，避免把数据源打到限流），每算完一只立即渲染 */
  const run = useCallback(async () => {
    const items = parseInput(text)
    if (!items.length || running) return
    abortRef.current = false
    setRunning(true)
    setRows([])
    setFailed([])
    setExpanded(null)
    setDone(0)
    setTotal(items.length)

    const acc: LiveValuation[] = []
    for (let i = 0; i < items.length; i++) {
      if (abortRef.current) break
      const q = items[i]
      setCurrent(q)
      try {
        // 非 6 位数字 → 先按名称查一次联想，取第一条
        let code = q
        if (!/^\d{6}$/.test(q)) {
          const found = await searchStocks(q)
          if (!found.length) throw new Error('未找到匹配的股票')
          code = found[0].code
        }
        const row = await valuateLive(code)
        if (apiOk !== true) setApiOk(true)   // 能算出结果就说明服务是通的，自动消掉告警
        acc.push(row)
        setRows([...acc])
      } catch (e) {
        setFailed((prev) => [...prev, { code: q, msg: e instanceof Error ? e.message : '计算失败' }])
      } finally {
        setDone(i + 1)
      }
    }
    setCurrent('')
    setRunning(false)
  }, [text, running, apiOk])

  const stop = () => {
    abortRef.current = true
  }

  const clearAll = () => {
    abortRef.current = true
    setText('')
    setRows([])
    setFailed([])
    setDone(0)
    setTotal(0)
    setExpanded(null)
  }

  const expand = (code: string) => {
    setExpanded((prev) => (prev === code ? null : code))
    window.setTimeout(() => {
      const el = detailRef.current
      if (!el) return
      const header = document.querySelector('header')
      const offset = (header?.getBoundingClientRect().height ?? 64) + 16
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - offset,
        behavior: 'smooth',
      })
    }, 160)
  }

  const expandedRow = rows.find((r) => r.code === expanded) ?? null

  return (
    <div>
      <PageHeader
        eyebrow="量化估值"
        title="股票估值实验室"
        desc={`批量输入股票代码或名称（最多 ${MAX_BATCH} 只），实时跑完整估值管线，一次拿到六维评价、合理区间与决策结论。`}
        right={
          <span className="hidden items-center gap-1.5 rounded-xl border border-ink-700 bg-ink-900 px-3 py-1.5 text-[12px] text-mist-500 md:inline-flex">
            <Calculator size={13} className="text-gold" />
            模型版本 v3.0 · 实时计算
          </span>
        }
      />

      {/* 批量输入 */}
      <Card className="mb-4">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3.5 top-3 text-mist-700"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run()
            }}
            rows={2}
            disabled={running}
            placeholder="600519, gzmt, 伊利股份…　（代码 / 名称 / 拼音首字母，逗号或空格分隔）"
            className="w-full resize-none rounded-xl border border-ink-700 bg-ink-950 py-2.5 pl-10 pr-3 text-[13.5px] leading-relaxed text-mist-100 outline-none transition placeholder:text-mist-700 focus:border-gold/50 disabled:opacity-60"
          />
        </div>

        {/* 输入联想：代码 / 名称 / 拼音首字母都走这里 */}
        {sug.length > 0 && !running ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-mist-700">匹配</span>
            {sug.map((it) => (
              <button
                key={it.code}
                type="button"
                onClick={() => applySug(it.code)}
                className="rounded-md border border-ink-700 bg-ink-850 px-1.5 py-0.5 text-[11.5px] text-mist-300 transition hover:border-gold/40 hover:text-gold-soft"
              >
                {it.name}
                <span className="ml-1 text-[10.5px] text-mist-700">{it.code}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={run}
            disabled={running || !queued.length}
            className="btn btn-primary h-10 px-4 text-[13px] disabled:opacity-50"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />}
            {running ? `计算中 ${done}/${total}` : queued.length ? `开始计算（${queued.length} 只）` : '开始计算'}
          </button>
          {running ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-[12.5px] text-mist-400 transition hover:text-down"
            >
              停止
            </button>
          ) : null}
          {text || rows.length ? (
            <button
              type="button"
              onClick={clearAll}
              className="flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-[12.5px] text-mist-400 transition hover:text-mist-200"
            >
              <Trash2 size={12} /> 清空
            </button>
          ) : null}

          <span className="ml-auto flex flex-wrap items-center gap-1.5 text-[11.5px] text-mist-700">
            示例
            {EXAMPLES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setText((prev) => (prev ? `${prev}, ${e}` : e))}
                disabled={running}
                className="rounded-md border border-ink-700 px-1.5 py-0.5 text-[11px] text-mist-500 transition hover:border-gold/40 hover:text-gold-soft disabled:opacity-50"
              >
                {e}
              </button>
            ))}
          </span>
        </div>

        {running ? (
          <div className="mt-3">
            <div className="h-1 overflow-hidden rounded-full bg-ink-850">
              <div
                className="h-full rounded-full bg-gold transition-all duration-300"
                style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11.5px] text-mist-500">
              正在计算 {Math.min(done + 1, total)}/{total}：{current}　·　每只约 3–6 秒
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[11.5px] text-mist-700">
            支持代码、中文名、拼音首字母（如 gzmt → 贵州茅台），输入时会给出匹配候选。每只约 3–6 秒；Ctrl / ⌘ + Enter 直接开始。
          </p>
        )}

        {apiOk === false ? (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-[11.5px] leading-relaxed text-gold-soft">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span className="flex-1">
              {isLocal ? (
                <>
                  计算服务未启动，无法实时计算。启动方式：在
                  <code className="mx-1 rounded bg-ink-950 px-1 py-0.5 text-[11px]">
                    stock_value_estimator-main
                  </code>
                  目录运行
                  <code className="mx-1 rounded bg-ink-950 px-1 py-0.5 text-[11px]">
                    python api/server.py --port 8787
                  </code>
                </>
              ) : (
                <>
                  计算服务暂时连不上（可能正在冷启动或刚重启），已自动重试仍未成功。
                  稍等片刻点「重试」即可，无需刷新页面。
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => void probeApi()}
              disabled={apiChecking}
              className="shrink-0 rounded-md border border-gold/40 px-2 py-0.5 text-[11px] text-gold-soft transition hover:bg-gold/10 disabled:opacity-50"
            >
              {apiChecking ? '检测中…' : '重试'}
            </button>
          </div>
        ) : null}
      </Card>

      <ValuationRiskNotice />

      {/* 失败项 */}
      {failed.length ? (
        <Card className="mb-4 border-down/30">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px] text-down">
            <AlertCircle size={13} />
            {failed.length} 只未能计算
          </h3>
          <ul className="space-y-1 text-[12px] text-mist-500">
            {failed.map((f) => (
              <li key={f.code} className="flex items-start gap-1.5">
                <X size={11} className="mt-1 shrink-0 text-down" />
                <span>
                  <span className="text-mist-300">{f.code}</span>：{f.msg}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* 结果汇总 */}
      {rows.length ? (
        <div className="mb-6">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="serif text-[18px] text-mist-100">
              计算结果
              <span className="ml-2 text-[12px] font-normal text-mist-700">
                共 {rows.length} 只 · 点击任意行展开全貌
              </span>
            </h2>
            {running ? (
              <span className="text-[11.5px] text-mist-500">
                还有 {total - done} 只待算…
              </span>
            ) : null}
          </div>

          {/* 桌面表格 */}
          <Card padded={false} className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-ink-700 text-[11.5px] uppercase tracking-[0.12em] text-mist-700">
                    <th className="w-8 px-3 py-2.5 text-center font-medium">#</th>
                    <th className="px-3 py-2.5 font-medium">代码 / 名称</th>
                    <th className="px-3 py-2.5 font-medium">模式 × 阶段</th>
                    <th className="px-3 py-2.5 text-right font-medium">六维</th>
                    <th className="px-3 py-2.5 font-medium">主模型</th>
                    <th className="px-3 py-2.5 text-right font-medium">合理区间</th>
                    <th className="px-3 py-2.5 text-right font-medium">现价</th>
                    <th className="px-3 py-2.5 text-right font-medium">判定</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <ResultRow
                      key={r.code}
                      row={r}
                      index={i}
                      expanded={expanded === r.code}
                      onToggle={() => expand(r.code)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 移动端卡片 */}
          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <ResultCard
                key={r.code}
                row={r}
                expanded={expanded === r.code}
                onToggle={() => expand(r.code)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* 展开的单只详情 */}
      <div ref={detailRef} className="scroll-mt-24">
        {expandedRow ? (
          <div className="mb-4">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="serif text-[19px] text-mist-100">
                  {expandedRow.name}
                  <span className="ml-2 text-[12.5px] text-mist-700">{expandedRow.code}</span>
                </h2>
                <span
                  className={cn(
                    'rounded-lg border px-2 py-0.5 text-[12px]',
                    verdictTone(expandedRow.verdict, expandedRow.rejected, expandedRow.avoid),
                  )}
                >
                  {verdictLabel(expandedRow.verdict, expandedRow.rejected, expandedRow.avoid)}
                </span>
                {expandedRow._cached ? (
                  <span className="rounded-md bg-ink-850 px-1.5 py-0.5 text-[10.5px] text-mist-700">
                    缓存
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setExpanded(null)}
                className="flex items-center gap-1 text-[12px] text-mist-500 transition hover:text-gold-soft"
              >
                <ChevronDown size={13} /> 收起
              </button>
            </div>
            <p className="mb-3 text-[12px] text-mist-500">
              {expandedRow.industry ?? '—'}　·　{expandedRow.mode ?? '—'} × {expandedRow.stage ?? '—'}
              {expandedRow.substage ? `（${expandedRow.substage}）` : ''}　·　现价{' '}
              {fmtNum(expandedRow.price)}
              {expandedRow._elapsed ? `　·　耗时 ${expandedRow._elapsed}s` : ''}
            </p>
            <ValuationResultView row={expandedRow} />
          </div>
        ) : rows.length ? (
          <p className="mb-4 rounded-xl border border-dashed border-ink-700 px-4 py-4 text-center text-[12.5px] text-mist-700">
            <ChevronUp size={13} className="mr-1 inline" />
            点击上方任意一行，查看该股票的六维、估值区间与排雷详情
          </p>
        ) : null}
      </div>

      {/* 空态：还没算过 */}
      {!rows.length && !running && !failed.length ? (
        <Card className="py-10 text-center">
          <Calculator size={26} className="mx-auto mb-2.5 text-mist-700" />
          <p className="text-[14px] text-mist-300">输入一组股票代码或名称，开始批量计算</p>
          <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-mist-700">
            支持 6 位代码与中文名称混输。计算结果仅在当前页面，不写入数据库——
            这里的目标是一次算完一批，而不是维护一张样本清单。
          </p>
        </Card>
      ) : null}

      <Disclaimer text={VALUATION_DISCLAIMER} />
    </div>
  )
}
