/**
 * ── 文件：src/lib/utils.ts ──────────────────────────────────────
 * 功能：纯函数工具：className 合并、日期格式化、相对时间、阅读时长、标题锚点、标签解析、
 *       手机号归一化 / 校验、视频 URL 解析、错误文案本地化。
 * 改动指引：
 *   1. 改日期格式 → formatDate / formatDateTime；
 *   2. 支持新视频源 → parseVideoUrl（当前识别 B 站 BV 号与直链 mp4）；
 *   3. 改错误提示措辞 → readableError 的映射表；
 *   4. 放宽手机号规则 → isMainlandPhone。
 */

import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatDate(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`
}

export function relativeTime(value?: string | null) {
  if (!value) return '—'
  const ts = new Date(value).getTime()
  if (Number.isNaN(ts)) return '—'
  const diff = Date.now() - ts
  const min = 60_000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`
  return formatDate(value)
}

export function readingMinutes(markdown: string) {
  const text = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*`_\-[\]()!]/g, ' ')
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const words = (text.match(/[A-Za-z0-9]+/g) || []).length
  return Math.max(1, Math.round(cjk / 400 + words / 220))
}

export interface Heading {
  level: number
  text: string
  id: string
}

export function slugHeading(text: string, index: number) {
  const base = text
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
  return `${base || 'sec'}-${index}`
}

/** 抽取 Markdown 中的 ATX 标题，用于生成阅读目录 */
export function extractHeadings(markdown: string): Heading[] {
  const lines = markdown.split('\n')
  const headings: Heading[] = []
  let inFence = false
  let index = 0
  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = /^(#{1,4})\s+(.+?)\s*$/.exec(line)
    if (match) {
      const text = match[2].replace(/[*`_~]/g, '').trim()
      headings.push({ level: match[1].length, text, id: slugHeading(text, index++) })
    }
  }
  return headings
}

export function parseTagsInput(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ).slice(0, 12)
}

export function formatBytes(size?: number) {
  if (!size) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = size
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function randomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 手机号归一化：`138 0013 8000` / `+8613800138000` / `0086...` 统一成 `+86 13800138000`。
 *
 * 必须与云端 SDK 内部的归一化规则保持一致 —— 注册与登录会拿同一个字符串去命中
 * 上游的账号标识，两边规则不同会导致「注册完却登录不上」。
 */
export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  const local = digits.startsWith('0086')
    ? digits.slice(4)
    : digits.startsWith('86') && digits.length === 13
      ? digits.slice(2)
      : digits
  return /^1\d{10}$/.test(local) ? `+86 ${local}` : phone.trim()
}

export function isMainlandPhone(phone: string) {
  return /^1\d{10}$/.test(phone.replace(/\D/g, '').replace(/^(0086|86)/, '')) || /^\+86\s?1\d{10}$/.test(phone.trim())
}

/** 解析课程回放链接：B 站（提取 BV 号转内嵌播放器）/ 直链视频 / 其他外链 */
export function parseVideoUrl(raw: string): {
  kind: 'bilibili' | 'direct' | 'other'
  embedUrl: string | null
} {
  const url = raw.trim()
  const bv = url.match(/BV[0-9A-Za-z]{10}/)
  if (bv) {
    return {
      kind: 'bilibili',
      embedUrl: `https://player.bilibili.com/player.html?bvid=${bv[0]}&autoplay=0&high_quality=1&danmaku=0`,
    }
  }
  if (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url)) {
    return { kind: 'direct', embedUrl: url }
  }
  return { kind: 'other', embedUrl: null }
}

/** 把云端错误转换为用户可以理解的中文提示 */
export function readableError(error: unknown): string {
  if (!error) return '操作失败，请稍后再试'
  const anyErr = error as { code?: string; message?: string; kind?: string }
  if (anyErr.kind === 'network' || anyErr.kind === 'backend-unavailable') {
    return '网络连接异常，请检查网络后重试'
  }
  if (anyErr.code === 'INVALID_USERNAME_OR_PASSWORD') {
    return '手机号或密码不正确，请检查后重试'
  }
  switch (anyErr.code) {
    case '42501':
      return '没有权限执行该操作，请确认是否已登录'
    case '23505':
      return '该记录已存在，请勿重复提交'
    case '42P01':
      return '数据表尚未初始化，请联系管理员'
    case '23503':
      return '关联数据仍在使用，无法删除'
    default:
      break
  }
  const msg = anyErr.message || String(error)
  if (/verification_code|verification code|验证码/i.test(msg)) {
    return '验证码不正确或已过期，请重新获取'
  }
  if (/jwt|token|session/i.test(msg)) return '登录状态已失效，请重新登录'
  if (/duplicate/i.test(msg)) return '该记录已存在，请勿重复提交'
  return msg.length > 120 ? msg.slice(0, 120) + '…' : msg
}
