/**
 * ── 文件：src/pages/MasterDocPage.tsx ───────────────────────────
 * 功能：高级学员进阶研报库：资料列表 + 附件下载。
 * 数据：listMaterials、AssetDownloadLink。
 * 改动指引：
 *   1. 改列表项 → MaterialRow 渲染区；
 *   2. 改附件行为 → AssetDownloadLink；
 *   3. 内容维护 → 后台 MaterialPanel。
 */

import { useCallback, useEffect, useState } from 'react'
import { BookOpen, FileText } from 'lucide-react'
import { Card, PageHeader, PendingContent } from '../components/PageHeader'
import { AssetDownloadLink } from '../components/AssetLink'
import { EmptyState } from '../components/ui'
import { cn, formatDate } from '../lib/utils'
import { readableError } from '../lib/utils'
import { listMaterials, type MaterialRow } from '../services/content'

/** 进阶研报库：资料列表 + 附件下载。 */
export function MasterDocPage() {
  const [rows, setRows] = useState<MaterialRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<string>('全部')

  const load = useCallback(async () => {
    try {
      setRows(await listMaterials())
    } catch (err) {
      setError(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const types = ['全部', ...Array.from(new Set(rows.map((r) => r.mtype)))]
  const visible = filter === '全部' ? rows : rows.filter((r) => r.mtype === filter)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Advanced Research"
        title="进阶研报库"
        desc="课程讲义、研报、模板工具与结营材料，仅高级学员可见。"
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-36 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState title="加载失败" desc={error} />
      ) : rows.length === 0 ? (
        <PendingContent hint="资料库已就位，讲义与研报随课程持续扩充，由管理员上传。" />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {types.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilter(t)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[12.5px] transition',
                  filter === t
                    ? 'bg-purple-500/15 text-purple-200'
                    : 'text-mist-500 hover:bg-ink-850',
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((row) => (
              <Card key={row.id} className="border-purple-500/20 bg-purple-500/[0.04]">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-200">
                    {row.mtype === '讲义' ? <BookOpen size={14} /> : <FileText size={14} />}
                  </span>
                  <span className="rounded border border-ink-700 px-1.5 py-0.5 text-[10.5px] text-mist-700">
                    {row.mtype}
                  </span>
                  <span className="ml-auto text-[11px] text-mist-700">{formatDate(row.created_at)}</span>
                </div>
                <h3 className="mt-3 text-[14px] text-mist-100">{row.title}</h3>
                {row.summary ? (
                  <p className="mt-1.5 text-[12px] leading-relaxed text-mist-500">{row.summary}</p>
                ) : null}
                {row.file_url ? (
                  <AssetDownloadLink
                    src={row.file_url}
                    fileName={row.title}
                    className="btn btn-ghost mt-3 w-full justify-center"
                  />
                ) : null}
              </Card>
            ))}
          </div>
        </>
      )}

      <p className="rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-[11.5px] text-mist-700">
        本页资料仅面向有效期内高级学员，请勿外传。
      </p>
    </div>
  )
}
