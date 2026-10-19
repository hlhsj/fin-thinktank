import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * 全局主题（夜晚 / 白天）。
 *
 * 实现方式：在 <html> 上挂 `data-theme`，index.css 里只需一份
 * `html[data-theme='light']` 覆盖块即可把整套色板（ink / mist / gold …）
 * 翻转为白天配色 —— 所有 Tailwind 工具类与组件类都引用 CSS 变量，
 * 因此无需逐组件改样式。
 *
 * 首屏防闪白由 index.html 里的同步脚本负责（在 CSS 生效前就把
 * data-theme 写好），这里只负责运行时切换与持久化。
 */
export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'thinktank.theme'

/** 与 index.css 中 --color-ink-950 的两种取值保持一致（同步移动端地址栏颜色） */
const META_COLOR: Record<Theme, string> = { dark: '#060910', light: '#f4f6fa' }

function readStoredTheme(): Theme {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark') return value
  } catch {
    /* 隐私模式下 localStorage 不可用，落到默认值 */
  }
  return 'dark'
}

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme())

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* 忽略写入失败 */
    }
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', META_COLOR[theme])
  }, [theme])

  const setTheme = useCallback((next: Theme) => setThemeState(next), [])
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
    [],
  )

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme 必须在 ThemeProvider 内使用')
  return ctx
}
