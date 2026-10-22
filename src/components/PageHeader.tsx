import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

/** 模块页统一头部：小标题 + 中文大标题 + 说明 */
export function PageHeader({
  eyebrow,
  title,
  desc,
  right,
  className,
}: {
  eyebrow: string
  title: string
  desc?: string
  right?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-5 flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        <p className="text-[11.5px] uppercase tracking-[0.18em] text-mist-700">{eyebrow}</p>
        <h1 className="serif mt-1.5 text-[26px] leading-tight text-mist-100">{title}</h1>
        {desc ? <p className="mt-1.5 max-w-2xl text-[13px] text-mist-500">{desc}</p> : null}
      </div>
      {right}
    </header>
  )
}

/** 卡片容器 */
export function Card({
  className,
  children,
  padded = true,
}: {
  className?: string
  children: ReactNode
  padded?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-ink-700 bg-ink-900',
        padded ? 'p-4 md:p-5' : '',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** 免责声明：金融数据相关页面固定展示 */
export function Disclaimer({ text }: { text: string }) {
  return (
    <p className="mt-5 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-[11.5px] leading-relaxed text-mist-700">
      免责声明：{text}
    </p>
  )
}

/** 空数据源提示：文档注明「先设计界面，内容后续由管理员补充」 */
export function PendingContent({ hint }: { hint?: string }) {
  return (
    <p className="mt-4 rounded-xl border border-dashed border-ink-700 bg-ink-900/60 px-4 py-6 text-center text-[12.5px] text-mist-700">
      {hint ?? '界面已就位，内容由管理员在后台补充。'}
    </p>
  )
}
