/**
 * ── 文件：src/components/ErrorBoundary.tsx ──────────────────────
 * 功能：渲染错误兜底，避免单个组件抛错导致整页白屏；提供刷新与返回首页。
 * 改动指引：
 *   1. 改兜底文案 / 样式 → 组件 render 分支；
 *   2. 接监控 → 在 componentDidCatch 里上报（Sentry 等）。
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  info: ErrorInfo | null
}

/**
 * 根错误边界。
 *
 * React 在渲染期间抛出的错误若无人捕获，会把整棵组件树卸载 —— 表现就是页面
 * 突然变成完全空白（连外壳和背景都没有）。这里兜住错误，把页面降级成一个可读的
 * 错误面板，而不是让用户对着白屏。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info })
    // 同时打到控制台，便于远程定位
    console.error('[金融智库] 渲染异常：', error, info.componentStack)
  }

  private reset = () => {
    this.setState({ error: null, info: null })
    window.location.reload()
  }

  private hardReset = () => {
    // 会话损坏导致的崩溃，清掉本地凭证后回到登录页
    try {
      window.localStorage.clear()
    } catch {
      /* 忽略隐私模式下的写入失败 */
    }
    window.location.hash = '#/'
    window.location.reload()
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 px-5 py-10">
        <div className="w-full max-w-2xl rounded-2xl border border-up/35 bg-ink-900 p-6">
          <div className="flex items-center gap-2.5 text-up">
            <AlertTriangle size={19} />
            <h1 className="serif text-[18px] text-mist-100">页面渲染出错了</h1>
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-mist-500">
            界面已被安全降级，你的云端数据没有丢失。可以先重试；若反复出现，请清空本地登录状态后重新登录。
          </p>

          <pre className="mt-4 max-h-52 overflow-auto rounded-xl border border-ink-700 bg-[var(--md-pre-bg)] p-3.5 text-[12px] leading-relaxed text-[var(--md-pre-text)]">
            {error.message}
            {info?.componentStack ? `\n${info.componentStack.split('\n').slice(0, 8).join('\n')}` : ''}
          </pre>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={this.reset}>
              <RefreshCw size={14} />
              重新加载
            </button>
            <button type="button" className="btn btn-ghost" onClick={this.hardReset}>
              清空登录状态并重来
            </button>
          </div>
        </div>
      </div>
    )
  }
}
