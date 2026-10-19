/**
 * ── 文件：src/context/ToastContext.tsx ──────────────────────────
 * 功能：全局轻提示，三种语气（success / error / info），自动消失。
 * 改动指引：
 *   1. 改停留时长 → ToastProvider 内的定时器；
 *   2. 加语气 → ToastTone 联合类型 + TONE_STYLE；
 *   3. 业务里调用 → const toast = useToast(); toast.success('已保存')。
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

type ToastTone = 'success' | 'error' | 'info'

interface Toast {
  id: number
  tone: ToastTone
  text: string
}

interface ToastContextValue {
  success: (text: string) => void
  error: (text: string) => void
  info: (text: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** 三种色调的文字与描边走 CSS 变量，白天/夜晚各一套 */
const TONE_STYLE: Record<ToastTone, { border: string; color: string; Icon: typeof Info }> = {
  success: { border: 'var(--tone-success-bd)', color: 'var(--tone-success-fg)', Icon: CheckCircle2 },
  error: { border: 'var(--tone-error-bd)', color: 'var(--tone-error-fg)', Icon: AlertTriangle },
  info: { border: 'var(--tone-info-bd)', color: 'var(--tone-info-fg)', Icon: Info },
}

/** 全局轻提示 Provider。 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((tone: ToastTone, text: string) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, tone, text }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3600)
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (text) => push('success', text),
      error: (text) => push('error', text),
      info: (text) => push('info', text),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-5 z-[100] flex w-[min(92vw,460px)] -translate-x-1/2 flex-col gap-2">
        {toasts.map((toast) => {
          const style = TONE_STYLE[toast.tone]
          const Icon = style.Icon
          return (
            <div
              key={toast.id}
              className="animate-fade-up pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-[var(--toast-bg)] px-3.5 py-2.5 text-[13px] shadow-[0_18px_40px_-16px_var(--shadow-tint)] backdrop-blur"
              style={{ borderColor: style.border, color: style.color }}
            >
              <Icon size={15} className="mt-0.5 shrink-0" />
              <span className="flex-1 leading-relaxed text-mist-100">{toast.text}</span>
              <button
                type="button"
                aria-label="关闭"
                className="shrink-0 text-mist-700 transition hover:text-mist-300"
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用')
  return ctx
}
