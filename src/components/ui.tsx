/**
 * ── 文件：src/components/ui.tsx ─────────────────────────────────
 * 功能：无业务依赖的基础组件：Spinner、LoadingBlock、EmptyState、Modal、ConfirmDialog、
 *       useConfirm、ProgressBar、ProgressRing。
 * 改动指引：
 *   1. 改加载态 → LoadingBlock 的骨架行数与动画；
 *   2. 改弹窗宽度 / 动效 → Modal（内部用 createPortal 挂到 body）；
 *   3. 业务里需要二次确认 → 一律 const confirm = useConfirm() 后 await confirm({...})。
 * 注意：不要用 window.confirm / window.alert —— iframe 预览环境会静默返回 false。
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Inbox, Loader2, X } from 'lucide-react'
import { cn } from '../lib/utils'

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" />
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-20 rounded-xl" />
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon?: ReactNode
  title: string
  desc?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink-700 bg-ink-900/50 px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-ink-700 bg-ink-850 text-mist-500">
        {icon ?? <Inbox size={19} />}
      </div>
      <p className="text-[15px] font-medium text-mist-300">{title}</p>
      {desc ? <p className="max-w-md text-[13px] leading-relaxed text-mist-700">{desc}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh] backdrop-blur-sm">
      <div
        className={cn(
          'animate-fade-up w-full rounded-2xl border border-ink-700 bg-ink-900 shadow-[0_30px_80px_-30px_var(--shadow-tint)]',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-700 px-5 py-3.5">
          <div>
            <h3 className="text-[15px] font-semibold text-mist-100">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-[12.5px] text-mist-700">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="rounded-lg p-1 text-mist-700 transition hover:bg-ink-800 hover:text-mist-300"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-ink-700 px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确认',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmText?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      width="max-w-md"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className={cn('btn', danger ? 'btn-danger' : 'btn-primary')}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <Spinner size={14} /> : null}
            {confirmText}
          </button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-mist-300">{message}</p>
    </Modal>
  )
}

interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  danger?: boolean
}

/**
 * 应用内确认弹窗（替代 window.confirm）。
 *
 * 重要：在 iframe / 内嵌预览等环境下，浏览器原生 confirm 会被静默拦截
 * （直接返回 false，连弹窗都不出现），表现为「点击删除没有任何反应」。
 * 统一改用应用内的 ConfirmDialog：
 *
 *   const { confirm, dialog } = useConfirm()
 *   const ok = await confirm({ title: '删除章节', message: '确定删除？' })
 *   if (!ok) return
 *   ...
 *   return <div>{dialog}…</div>
 */
export function useConfirm() {
  const [pending, setPending] = useState<{ opts: ConfirmOptions; resolve: (ok: boolean) => void } | null>(
    null,
  )

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ opts, resolve })),
    [],
  )

  const settle = (ok: boolean) => {
    if (!pending) return
    pending.resolve(ok)
    setPending(null)
  }

  const dialog = pending ? (
    <ConfirmDialog
      open
      title={pending.opts.title}
      message={pending.opts.message}
      confirmText={pending.opts.confirmText}
      danger={pending.opts.danger}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null

  return { confirm, dialog }
}

export function ProgressBar({
  value,
  color = 'var(--accent-gold)',
  height = 6,
}: {
  value: number
  color?: string
  height?: number
}) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="w-full overflow-hidden rounded-full bg-ink-750" style={{ height }}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${clamped}%`, background: color }}
      />
    </div>
  )
}

export function ProgressRing({
  value,
  size = 54,
  stroke = 5,
  color = 'var(--accent-gold)',
  children,
}: {
  value: number
  size?: number
  stroke?: number
  color?: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} className="stroke-ink-700" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <span className="absolute text-[11.5px] font-semibold" style={{ color }}>
        {children ?? `${Math.round(pct)}%`}
      </span>
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-[12.5px] font-medium text-mist-500">
        {label}
        {hint ? <span className="text-[11.5px] text-mist-700">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}
