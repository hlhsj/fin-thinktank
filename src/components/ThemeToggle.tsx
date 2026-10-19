/**
 * ── 文件：src/components/ThemeToggle.tsx ────────────────────────
 * 功能：日 / 夜主题切换按钮（左下角固定）。
 * 改动指引：
 *   1. 改位置 / 尺寸 → 外层 fixed 定位类；
 *   2. 改成三态（跟随系统 / 浅色 / 深色）→ 结合 context/ThemeContext 扩展；
 *   3. 换图标 → Sun / Moon（lucide-react）。
 */

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

/**
 * 白天 / 夜晚模式切换按钮：固定在整个网页左下角。
 * 移动端抬高到手机底部导航栏之上，避免遮挡。
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isLight = theme === 'light'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isLight ? '切换到夜晚模式' : '切换到白天模式'}
      aria-label={isLight ? '切换到夜晚模式' : '切换到白天模式'}
      className="fixed bottom-[4.75rem] left-4 z-[60] flex h-10 w-10 items-center justify-center rounded-full border border-ink-700 bg-ink-900/90 text-mist-500 shadow-[0_12px_30px_-16px_var(--shadow-tint)] backdrop-blur transition hover:border-gold/45 hover:text-gold-soft active:scale-95 lg:bottom-5"
    >
      <span key={theme} className="animate-fade-up flex items-center justify-center">
        {isLight ? <Moon size={16} /> : <Sun size={16} />}
      </span>
    </button>
  )
}
