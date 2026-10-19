import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Search } from 'lucide-react'
import { Card, PageHeader, PendingContent } from '../components/PageHeader'
import { EmptyState, Field, Spinner } from '../components/ui'
import { cn, formatDate, readableError } from '../lib/utils'
import { createPhoneChange } from '../services/content'
import { normalizePhone } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

export function ChangePhonePage() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [oldPhone, setOldPhone] = useState(user?.phone?.replace('+86 ', '') ?? '')
  const [newPhone, setNewPhone] = useState('')
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const remarkLeft = 50 - remark.length
  const valid = /^1\d{10}$/.test(oldPhone) && /^1\d{10}$/.test(newPhone) && oldPhone !== newPhone

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    try {
      await createPhoneChange({
        user_id: user?.id ?? null,
        old_phone: normalizePhone(oldPhone),
        new_phone: normalizePhone(newPhone),
        remark: remark.trim() || undefined,
      })
      setDone(true)
      toast.success('申请已提交')
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl pt-10">
        <Card className="border-gold/30 bg-gold/5 text-center">
          <p className="serif text-[20px] text-gold-soft">申请已提交</p>
          <p className="mt-2 text-[13px] leading-relaxed text-mist-400">
            换绑期间原号与新号均不影响正常使用。管理员通常会在 1 个工作日内完成核对并处理。
          </p>
          <button type="button" className="btn btn-primary mt-5" onClick={() => navigate('/member')}>
            返回学员中心
          </button>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        eyebrow="Change Phone"
        title="修改手机号"
        desc="权益没到账时，把有学员权益的号码换绑到当前账号使用的新号。"
      />

      <Card>
        <form className="space-y-4" onSubmit={submit}>
          <Field label="有学员权益的手机号">
            <input
              className="field"
              type="tel"
              inputMode="numeric"
              maxLength={11}
              value={oldPhone}
              onChange={(e) => setOldPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="原手机号"
            />
          </Field>
          <Field label="要更换成的新手机号">
            <input
              className="field"
              type="tel"
              inputMode="numeric"
              maxLength={11}
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="新手机号"
            />
          </Field>
          <Field label="备注" hint={`还可以输入 ${remarkLeft} 字`}>
            <textarea
              className="field min-h-[84px] resize-y"
              maxLength={50}
              value={remark}
              onChange={(e) => setRemark(e.target.value.slice(0, 50))}
              placeholder="例如：原号停用，权益转到此号"
            />
          </Field>

          <div className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-3 text-[11.5px] leading-relaxed text-mist-700">
            处理流程：提交后人工核对 → 通常 1 个工作日内处理 → 通过即完成换绑 → 权益迁移到新号 → 原号档案下线。
          </div>

          <button type="submit" className="btn btn-primary w-full" disabled={busy || !valid}>
            {busy ? <Spinner size={14} /> : null}提交换绑申请
          </button>
        </form>
      </Card>
    </div>
  )
}
