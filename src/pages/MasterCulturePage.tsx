import { useCallback, useEffect, useMemo, useState } from 'react'
import { PlayCircle, Sparkles, Video, X } from 'lucide-react'
import { Card, Disclaimer, PageHeader } from '../components/PageHeader'
import { EmptyState, Spinner } from '../components/ui'
import { SITE } from '../lib/site'
import { cn, formatDate, parseVideoUrl, readableError } from '../lib/utils'
import { listCourseVideos, type CourseVideoRow } from '../services/content'

const ABILITIES = [
  { title: '研究力', desc: '从读得懂财报，到写得出自己的研究结论。' },
  { title: '资料库', desc: '独立进阶资料库，随课程持续扩充。' },
  { title: '市场感', desc: '消息辨析与情绪感知，靠训练而非天赋。' },
  { title: '数据力', desc: '从零搭建个人数据阵地，把判断落到数据上。' },
]

/* ---------------- 课程回放 ---------------- */

function ReplayPlayer({ video, onClose }: { video: CourseVideoRow; onClose: () => void }) {
  const parsed = useMemo(() => parseVideoUrl(video.url), [video.url])
  return (
    <div className="border-b border-ink-700 bg-ink-950/60 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] text-mist-100">{video.title}</p>
          <p className="mt-0.5 text-[11.5px] text-mist-700">
            {video.period ? `${video.period} · ` : ''}
            {video.duration ? `${video.duration} · ` : ''}
            {formatDate(video.created_at)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-ink-700 px-2 py-1 text-[11.5px] text-mist-500 transition hover:text-mist-200"
        >
          <X size={12} />
          收起
        </button>
      </div>

      {parsed.kind === 'bilibili' && parsed.embedUrl ? (
        <iframe
          src={parsed.embedUrl}
          title={video.title}
          allowFullScreen
          scrolling="no"
          className="aspect-video w-full rounded-xl border border-ink-700 bg-black"
        />
      ) : parsed.kind === 'direct' ? (
        <video
          src={video.url}
          controls
          preload="metadata"
          className="aspect-video w-full rounded-xl border border-ink-700 bg-black"
        />
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-ink-700 bg-ink-900">
          <Video size={28} className="text-mist-700" />
          <p className="text-[12.5px] text-mist-600">该链接不支持站内播放</p>
          <a href={video.url} target="_blank" rel="noreferrer" className="btn btn-ghost">
            在新窗口观看
          </a>
        </div>
      )}

      {video.summary ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-mist-500">{video.summary}</p>
      ) : null}
    </div>
  )
}

function CourseReplaySection() {
  const [videos, setVideos] = useState<CourseVideoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setVideos(await listCourseVideos())
    } catch (err) {
      setError(readableError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const active = videos.find((v) => v.id === activeId) ?? null

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-4 py-3">
        <div>
          <h2 className="text-[14.5px] text-mist-100">高级学员课程回放</h2>
          <p className="mt-0.5 text-[11.5px] text-mist-700">
            {loading
              ? '加载中…'
              : videos.length
                ? `共 ${videos.length} 期 · 课程回放与连麦记录会在每次课后上传，由管理员维护`
                : '课程回放与连麦记录会在每次课后上传，由管理员维护'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-mist-700">
          <Spinner size={14} />
          正在载入回放列表…
        </div>
      ) : error ? (
        <div className="p-4">
          <EmptyState
            title="回放列表加载失败"
            desc={error}
            action={
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setError('')
                  setLoading(true)
                  void load()
                }}
              >
                重试
              </button>
            }
          />
        </div>
      ) : videos.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12.5px] text-mist-700">
          课程回放待上传，每次课后由管理员更新，届时可在此回看。
        </p>
      ) : (
        <>
          {active ? <ReplayPlayer video={active} onClose={() => setActiveId(null)} /> : null}
          <ul>
            {videos.map((v) => {
              const parsed = parseVideoUrl(v.url)
              const isActive = v.id === activeId
              return (
                <li key={v.id} className="border-b border-ink-800/70 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setActiveId(isActive ? null : v.id)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-3 text-left transition',
                      isActive ? 'bg-purple-500/[0.07]' : 'hover:bg-ink-850/70',
                    )}
                  >
                    <PlayCircle
                      size={20}
                      className={cn('shrink-0', isActive ? 'text-purple-300' : 'text-mist-600')}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        {v.period ? (
                          <span className="rounded border border-purple-500/35 bg-purple-500/10 px-1.5 py-px text-[10.5px] leading-4 text-purple-200">
                            {v.period}
                          </span>
                        ) : null}
                        <span className="truncate text-[13px] text-mist-100">{v.title}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-mist-700">
                        {v.summary || (parsed.kind === 'other' ? '外链观看' : '站内播放')}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right text-[11.5px] text-mist-700 sm:block">
                      {v.duration ? <span className="block">{v.duration}</span> : null}
                      <span className="block">{formatDate(v.created_at)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Card>
  )
}

export function MasterCulturePage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Top-tier Training"
        title="顶级投研能力培养"
        desc="像研究员一样思考：财报跟踪、行业研究框架，从读得懂得写到写得出。"
      />

      <Card className="border-purple-500/25 bg-purple-500/[0.05]">
        <p className="text-[13px] text-mist-200">课程时间安排</p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-mist-400">
          每周日下午两小时，小班连麦陪跑全程记录。课程回放可在「高级学员课程回放」中回看。
        </p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ABILITIES.map((item) => (
          <Card key={item.title}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10">
              <Sparkles size={15} className="text-purple-200" />
            </span>
            <p className="mt-3 text-[14px] text-mist-100">{item.title}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-mist-600">{item.desc}</p>
          </Card>
        ))}
      </div>

      <Card>
        <p className="mb-2 text-[13px] text-mist-200">阶段性安排</p>
        <ol className="space-y-2 text-[12.5px] leading-relaxed text-mist-500">
          <li>1. 财报跟踪：建立标的的财务跟踪表，逐个季度对齐。</li>
          <li>2. 行业框架：搭起行业研究骨架，明确变量与验证路径。</li>
          <li>3. 输出训练：从读得懂到写得出，形成可复用的研究模板。</li>
          <li>4. 数据阵地：把个人判断沉淀成可查询的数据体系。</li>
        </ol>
      </Card>

      <CourseReplaySection />

      <p className="text-[11.5px] text-mist-700">
        如有排期调整请联系管理员（{SITE.owner}）。
      </p>

      <Disclaimer text="本页仅介绍课程能力维度与训练方式，不构成投资建议。" />
    </div>
  )
}
