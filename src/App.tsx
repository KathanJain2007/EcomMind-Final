import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { AppProvider, useApp } from '@/store/AppContext'
import AppLayout from '@/components/layout/AppLayout'
import Login from '@/pages/auth/Login'
import Register from '@/pages/auth/Register'
import Onboarding from '@/pages/auth/Onboarding'
import Overview from '@/pages/Overview'
import { Skeleton } from '@/components/ui/skeleton'

const Inventory = lazy(() => import('@/pages/Inventory'))
const Analytics = lazy(() => import('@/pages/Analytics'))
const Insights = lazy(() => import('@/pages/Insights'))
const AgentMarketplace = lazy(() => import('@/pages/AgentMarketplace'))
const SupplierMarketplace = lazy(() => import('@/pages/SupplierMarketplace'))
const Negotiations = lazy(() => import('@/pages/Negotiations'))
const Activity = lazy(() => import('@/pages/Activity'))
const Wallet = lazy(() => import('@/pages/Wallet'))
const Escrow = lazy(() => import('@/pages/Escrow'))
const Reports = lazy(() => import('@/pages/Reports'))
const Settings = lazy(() => import('@/pages/Settings'))
const ImportData = lazy(() => import('@/pages/ImportData'))

function PageLoader() {
  return (
    <div className="space-y-4" aria-label="Loading page">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { auth } = useApp()
  const location = useLocation()
  if (!auth.loggedIn) return <Navigate to="/login" replace />
  if (!auth.onboarded && location.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { auth } = useApp()
  if (auth.loggedIn) return <Navigate to={auth.onboarded ? '/' : '/onboarding'} replace />
  return <>{children}</>
}

function AppRoutes() {
  const { auth } = useApp()
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/onboarding" element={auth.loggedIn ? (auth.onboarded ? <Navigate to="/" replace /> : <Onboarding />) : <Navigate to="/login" replace />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Overview />} />
        <Route path="inventory" element={<Suspense fallback={<PageLoader />}><Inventory /></Suspense>} />
        <Route path="analytics" element={<Suspense fallback={<PageLoader />}><Analytics /></Suspense>} />
        <Route path="insights" element={<Suspense fallback={<PageLoader />}><Insights /></Suspense>} />
        <Route path="agents" element={<Suspense fallback={<PageLoader />}><AgentMarketplace /></Suspense>} />
        <Route path="suppliers" element={<Suspense fallback={<PageLoader />}><SupplierMarketplace /></Suspense>} />
        <Route path="negotiations" element={<Suspense fallback={<PageLoader />}><Negotiations /></Suspense>} />
        <Route path="activity" element={<Suspense fallback={<PageLoader />}><Activity /></Suspense>} />
        <Route path="wallet" element={<Suspense fallback={<PageLoader />}><Wallet /></Suspense>} />
        <Route path="escrow" element={<Suspense fallback={<PageLoader />}><Escrow /></Suspense>} />
        <Route path="reports" element={<Suspense fallback={<PageLoader />}><Reports /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
        <Route path="import" element={<Suspense fallback={<PageLoader />}><ImportData /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  )
}
