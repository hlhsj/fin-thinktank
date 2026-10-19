import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  adminGrant,
  adminRevoke,
  adminListUsers,
  adminSetAdmin,
  loginAccount,
  refreshAccount,
  registerAccount,
  type AccountSession,
  type AdminUserRow,
} from '../services/auth'
import { normalizePhone } from '../lib/utils'

/**
 * 本站使用自建账号体系（存在云数据库的 app_users 表）。
 * 权益为「学员」与「高级学员」两条**相互独立**的有效期，各自到期互不影响。
 */
export interface AppUser {
  id: string
  phone: string
  nickname: string
  displayName: string
  /** 学员到期日，null = 未开通 */
  memberExpireAt: string | null
  /** 高级学员到期日，null = 未开通 */
  masterExpireAt: string | null
  masterPeriod: string | null
  isAdmin: boolean
  /** 服务端签发的访问令牌：受保护数据（订单/章节/留言）的读取需带上它 */
  token: string | null
}

const STORAGE_KEY = 'thinktank.session'

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length > 7 ? `${digits.slice(0, 3)}****${digits.slice(-4)}` : phone
}

function toAppUser(s: AccountSession): AppUser {
  const phone = normalizePhone(s.phone)
  return {
    id: s.uid,
    phone,
    nickname: s.nickname,
    displayName: s.nickname?.trim() || (phone ? maskPhone(phone) : '同学'),
    memberExpireAt: s.memberExpireAt,
    masterExpireAt: s.masterExpireAt,
    masterPeriod: s.masterPeriod,
    isAdmin: s.isAdmin,
    token: s.token ?? null,
  }
}

export function daysLeft(expireAt?: string | null) {
  if (!expireAt) return null
  const end = new Date(`${expireAt}T23:59:59`).getTime()
  if (Number.isNaN(end)) return null
  return Math.ceil((end - Date.now()) / 864e5)
}

export function isMemberValid(user: AppUser | null) {
  const left = daysLeft(user?.memberExpireAt)
  return left !== null && left > 0
}

export function isMasterValid(user: AppUser | null) {
  const left = daysLeft(user?.masterExpireAt)
  return left !== null && left > 0
}

interface AuthContextValue {
  ready: boolean
  user: AppUser | null
  signOut: () => void
  signInWithPassword: (phone: string, password: string) => Promise<AppUser>
  signUp: (phone: string, password: string, nickname?: string) => Promise<AppUser>
  refresh: () => Promise<AppUser | null>
  adminUsers: () => Promise<AdminUserRow[]>
  grantEntitlement: (phone: string, memberExpire: string | null, masterExpire: string | null) => Promise<void>
  toggleAdmin: (uid: string, isAdmin: boolean) => Promise<void>
  /** 取消权益：kind 为 member（仅学员）/ master（仅高级学员）/ all（两者都取消） */
  revokeEntitlement: (uid: string, kind: 'member' | 'master' | 'all') => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readStored(): { session: AccountSession } | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? { session: JSON.parse(raw) as AccountSession } : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<AppUser | null>(null)

  useEffect(() => {
    const stored = readStored()
    setUser(stored ? toAppUser(stored.session) : null)
    setReady(true)
  }, [])

  const persist = useCallback((session: AccountSession) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    setUser(toAppUser(session))
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    return {
      ready,
      user,
      signOut() {
        try {
          window.localStorage.removeItem(STORAGE_KEY)
        } catch {
          /* 隐私模式下 localStorage 可能不可用，忽略即可 */
        }
        setUser(null)
      },
      async signInWithPassword(phone, password) {
        const session = await loginAccount(phone.trim(), password)
        persist(session)
        return toAppUser(session)
      },
      async signUp(phone, password, nickname) {
        const session = await registerAccount(phone.trim(), password, nickname)
        persist(session)
        return toAppUser(session)
      },
      async refresh() {
        if (!user) return null
        // 传入现有 token：刷新权益的 RPC 不签发新令牌，需沿用旧值
        const session = await refreshAccount(user.id, user.token)
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
        } catch {
          /* noop */
        }
        setUser(toAppUser(session))
        return toAppUser(session)
      },
      adminUsers() {
        if (!user?.isAdmin) throw new Error('没有后台管理权限')
        return adminListUsers(user.id, user.token)
      },
      async grantEntitlement(phone, memberExpire, masterExpire) {
        if (!user?.isAdmin) throw new Error('没有后台管理权限')
        await adminGrant(user.id, user.token, phone, memberExpire, masterExpire)
      },
      async revokeEntitlement(uid, kind) {
        if (!user?.isAdmin) throw new Error('没有后台管理权限')
        await adminRevoke(user.id, user.token, uid, kind)
      },
      async toggleAdmin(uid, isAdmin) {
        if (!user?.isAdmin) throw new Error('没有后台管理权限')
        await adminSetAdmin(user.id, user.token, uid, isAdmin)
      },
    }
  }, [ready, user, persist])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}
