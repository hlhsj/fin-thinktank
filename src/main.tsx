/**
 * ── 文件：src/main.tsx ──────────────────────────────────────────
 * 功能：应用挂载入口，把 <App /> 挂到 index.html 的 #root 上。
 * 改动指引：
 *   1. 换挂载节点 → 改 getElementById('root')，并同步 index.html 里的 <div id="root">；
 *   2. 加全局 Provider（埋点、i18n）→ 包在 <App /> 外层；ThemeProvider 需保持在最外层，首屏主题依赖它。
 */

import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('未找到 #root 挂载节点')

createRoot(container).render(<App />)
