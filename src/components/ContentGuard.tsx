import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

/**
 * 内容防外流（非管理员生效）。
 *
 * 做法：禁用复制 / 剪切 / 右键菜单 / 拖拽，并通过 `body.no-copy` 关闭文本选择
 * （表单控件在 CSS 里单独放开，否则无法输入与编辑）。
 * 管理员不设限制，便于运维与导出数据。
 *
 * ⚠️ 边界要清楚：这挡的是「选中→复制」「右键另存」「拖拽」这些**常见外流路径**，
 * 提高随手搬运的成本；但**无法防住**开发者工具读接口、截图、OCR、录屏等手段。
 * 也就是说它是「提高门槛」，不是「绝对阻止」——真正敏感的数据应以服务端权限为准
 * （受保护表已收回匿名读权限，见 services/content.ts 中的各 RPC）。
 */
export function ContentGuard() {
  const { user } = useAuth()
  const isAdmin = Boolean(user?.isAdmin)

  useEffect(() => {
    if (isAdmin) {
      document.body.classList.remove('no-copy')
      return
    }
    document.body.classList.add('no-copy')

    const block = (e: Event) => {
      // 表单控件内的复制/剪切放行，否则无法正常编辑输入
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return
      // 显式标记 data-allow-copy 的区域放行 —— 例如付款页的「管理员微信号」与订单号，
      // 用户需要复制它们才能加好友、对账（配合 CSS 的 select-text 一起生效）
      if (typeof el?.closest === 'function' && el.closest('[data-allow-copy]')) return
      e.preventDefault()
    }

    const events = ['copy', 'cut', 'contextmenu', 'dragstart'] as const
    events.forEach((name) => document.addEventListener(name, block))
    return () => {
      document.body.classList.remove('no-copy')
      events.forEach((name) => document.removeEventListener(name, block))
    }
  }, [isAdmin])

  return null
}
