import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, isMasterValid, isMemberValid, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider } from './context/ThemeContext'
import { ContentGuard } from './components/ContentGuard'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemeToggle } from './components/ThemeToggle'
import { AppShell } from './components/AppShell'
import { EmptyState, Spinner } from './components/ui'

/**
 * 页面全部按路由懒加载：非图表页面首屏不再下载 echarts（约 544KB / gzip 186KB），
 * 各页面也拆成独立 chunk。注意页面组件是**命名导出**，需映射为 default。
 */
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const ChangePhonePage = lazy(() => import('./pages/ChangePhonePage').then((m) => ({ default: m.ChangePhonePage })))
const MemberHomePage = lazy(() => import('./pages/MemberHomePage').then((m) => ({ default: m.MemberHomePage })))
const DocLibraryPage = lazy(() => import('./pages/DocLibraryPage').then((m) => ({ default: m.DocLibraryPage })))
const ReviewPage = lazy(() => import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage })))
const ReviewDetailPage = lazy(() => import('./pages/ReviewDetailPage').then((m) => ({ default: m.ReviewDetailPage })))
const CaseListPage = lazy(() => import('./pages/CaseListPage').then((m) => ({ default: m.CaseListPage })))
const CaseDetailPage = lazy(() => import('./pages/CaseDetailPage').then((m) => ({ default: m.CaseDetailPage })))
const MarketPage = lazy(() => import('./pages/MarketPage').then((m) => ({ default: m.MarketPage })))
const TempFactorPage = lazy(() => import('./pages/TempFactorPage').then((m) => ({ default: m.TempFactorPage })))
const AiTutorPage = lazy(() => import('./pages/AiTutorPage').then((m) => ({ default: m.AiTutorPage })))
const MessageBoardPage = lazy(() => import('./pages/MessageBoardPage').then((m) => ({ default: m.MessageBoardPage })))
const CompanyResearchPage = lazy(() =>
  import('./pages/CompanyResearchPage').then((m) => ({ default: m.CompanyResearchPage })),
)
const MasterDocPage = lazy(() => import('./pages/MasterDocPage').then((m) => ({ default: m.MasterDocPage })))
const MasterCulturePage = lazy(() =>
  import('./pages/MasterCulturePage').then((m) => ({ default: m.MasterCulturePage })),
)
const HomeworkPage = lazy(() => import('./pages/HomeworkPage').then((m) => ({ default: m.HomeworkPage })))
const MasterIntroPage = lazy(() => import('./pages/MasterIntroPage').then((m) => ({ default: m.MasterIntroPage })))
const PayPage = lazy(() => import('./pages/PayPage').then((m) => ({ default: m.PayPage })))
const UserProfilePage = lazy(() => import('./pages/UserProfilePage').then((m) => ({ default: m.UserProfilePage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

function BootSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-950">
      <span className="serif flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/25 to-transparent text-[22px] text-gold-soft">
        超
      </span>
      <p className="flex items-center gap-2 text-[13px] text-mist-500">
        <Spinner size={14} />
        正在进入智库系统…
      </p>
    </div>
  )
}

function Paywall() {
  return (
    <EmptyState
      icon={<Spinner size={18} />}
      title="本次权益已到期"
      desc="学习与进阶内容的访问需要有效的学员/高级学员权益，前往续费页开通后即可继续学习。"
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <a href="#/pay" className="btn btn-primary">
            前往续费
          </a>
        </div>
      }
    />
  )
}

function RequireMember({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (!isMemberValid(user)) return <Paywall />
  return <>{children}</>
}

function RequireMaster({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (!isMemberValid(user)) return <Paywall />
  if (!isMasterValid(user)) return <MasterPaywall />
  return <>{children}</>
}

function MasterPaywall() {
  return (
    <EmptyState
      icon={<Spinner size={18} />}
      title="高级学员专区"
      desc="本专区在高级学员权益有效期内开放，前往开通后即可查看。"
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <a href="#/pay" className="btn btn-primary">
            前往开通
          </a>
        </div>
      }
    />
  )
}

function MemberRoutes() {
  return (
    <AppShell>
      <ScrollToTop />
      {/* 内层 Suspense 用内容区骨架：懒加载页面 chunk 时侧边栏保持可见 */}
      <Suspense fallback={<PageFallback />}>
        <Routes>
        <Route path="/member" element={<MemberHomePage />} />
        <Route
          path="/member/doc"
          element={
            <RequireMember>
              <DocLibraryPage />
            </RequireMember>
          }
        />
        <Route
          path="/member/review"
          element={
            <RequireMember>
              <ReviewPage />
            </RequireMember>
          }
        />
        <Route
          path="/member/review/:id"
          element={
            <RequireMember>
              <ReviewDetailPage />
            </RequireMember>
          }
        />
        <Route
          path="/member/replay"
          element={
            <RequireMember>
              <CaseListPage />
            </RequireMember>
          }
        />
        <Route
          path="/member/replay/:id"
          element={
            <RequireMember>
              <CaseDetailPage />
            </RequireMember>
          }
        />
        <Route
          path="/member/market"
          element={
            <RequireMember>
              <MarketPage />
            </RequireMember>
          }
        />
        <Route path="/member/market/history" element={<Navigate to="/member/market" replace />} />
        <Route
          path="/member/temp/:factor"
          element={
            <RequireMember>
              <TempFactorPage />
            </RequireMember>
          }
        />
        <Route
          path="/member/ai"
          element={
            <RequireMember>
              <AiTutorPage />
            </RequireMember>
          }
        />
        <Route
          path="/member/message"
          element={
            <RequireMember>
              <MessageBoardPage />
            </RequireMember>
          }
        />
        <Route
          path="/member/research"
          element={
            <RequireMember>
              <CompanyResearchPage />
            </RequireMember>
          }
        />
        <Route path="/member/trade" element={<Navigate to="/member/research" replace />} />
        <Route
          path="/member/master/doc"
          element={
            <RequireMaster>
              <MasterDocPage />
            </RequireMaster>
          }
        />
        <Route
          path="/member/master/culture"
          element={
            <RequireMaster>
              <MasterCulturePage />
            </RequireMaster>
          }
        />
        <Route
          path="/member/master/homework"
          element={
            <RequireMaster>
              <HomeworkPage />
            </RequireMaster>
          }
        />
        <Route path="/pay" element={<PayPage />} />
        <Route path="/member/profile" element={<UserProfilePage />} />
        <Route path="/profile/change-phone" element={<ChangePhonePage />} />
        <Route path="/admin" element={<RequireAdmin />} />
        <Route path="*" element={<Navigate to="/member" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}

function RequireAdmin() {
  const { user } = useAuth()
  if (!user?.isAdmin) return <Navigate to="/member" replace />
  return <AdminPage />
}

function Gate() {
  const { ready, user } = useAuth()
  if (!ready) return <BootSplash />
  return user ? <MemberRoutes /> : <LoginPage />
}

/** 路由懒加载时的内容区占位（外壳保留，只替换内容区） */
function PageFallback() {
  return (
    <div className="flex justify-center py-24">
      <Spinner size={22} />
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <HashRouter>
          <ToastProvider>
            <AuthProvider>
              {/* 内容防外流：非管理员禁用复制/右键/选择（管理员不受限） */}
              <ContentGuard />
              <Suspense fallback={<BootSplash />}>
                <Routes>
                  <Route path="/master" element={<MasterIntroPage />} />
                  <Route path="/*" element={<Gate />} />
                </Routes>
              </Suspense>
              {/* 全站通用的白天/夜晚切换，固定左下角 */}
              <ThemeToggle />
            </AuthProvider>
          </ToastProvider>
        </HashRouter>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
