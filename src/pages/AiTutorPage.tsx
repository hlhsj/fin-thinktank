/**
 * ── 文件：src/pages/AiTutorPage.tsx ─────────────────────────────
 * 功能：AI 助教占位页（推荐问题 + 说明），当前不提供可交互输入。
 * 改动指引：
 *   1. 接入模型 → 用 cloud.llm 或自有接口，替换下方静态卡片为消息列表 + 输入框；
 *   2. 改开场白 → OPENING；
 *   3. 改推荐问题 → RECOMMENDED。
 */

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Card, Disclaimer, PageHeader } from '../components/PageHeader'
import { Field } from '../components/ui'
import { cn } from '../lib/utils'

const RECOMMENDED = [
  '这门课程一共分几个阶段？',
  '估值温度是怎么算出来的？',
  '复盘文档一般什么时候更新？',
  '企业研究表的数据从哪里来？',
  '智库百科里怎么查市盈率？',
]

const OPENING = '你好，我是智库 AI 助教，可以问我课程内容、工具使用相关的问题。'

/** AI 助教占位页（当前只展示推荐问题，无输入交互）。 */
export function AiTutorPage() {
  const [messages, setMessages] = useState<Array<{ role: 'ai' | 'me'; text: string }>>([
    { role: 'ai', text: OPENING },
  ])
  // 说明：AI 助教尚未开发完成 —— 按测试报告的处理，开发完成前**不提供可交互输入区**，
  // 推荐问题仅作预览（禁用态），避免点击后行为未定义。功能上线时再恢复 send() 与表单。

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="AI Tutor"
        title="AI 问答"
        desc="AI 助教待开发中。"
      />

      <Card>
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'me' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                  m.role === 'me'
                    ? 'border border-gold/30 bg-gold/10 text-mist-100'
                    : 'border border-ink-700 bg-ink-850 text-mist-300',
                )}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <p className="mb-2 flex items-center gap-1.5 text-[11.5px] text-mist-700">
            <Sparkles size={12} />
            推荐问题（功能开发中，以下仅为预览）
          </p>
          <div className="flex flex-wrap gap-2">
            {RECOMMENDED.map((q) => (
              <button
                key={q}
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 text-[12.5px] text-mist-700 opacity-60"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Disclaimer text="AI 助教的知识范围限定为课程内容与工具使用，不输出任何投资建议。" />
    </div>
  )
}
