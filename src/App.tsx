// src/App.tsx
import { Route, Routes, Navigate, Outlet } from 'react-router-dom'
import { AlertBanner } from './components/AlertBannerComponent'
import NavBar from './components/NavBar'
import Feed from './pages/Feed'
import Alerts from './pages/Alerts'
import Events from './pages/Events'
import Businesses from './pages/Businesses'
import Admin from './pages/Admin'
import Profile from './pages/Profile'
import AuthProvider, { useAuth } from './components/AuthProvider'
import type { ReactNode } from 'react'
import StaticPage from './pages/StaticPage'
import AdminPages from './pages/AdminPages'
import RecyclingHub from './pages/RecyclingHub'


function ProtectedRoute({
  children,
  requireModerator = false,
}: { requireModerator?: boolean; children: ReactNode }) {
  const { ready, session, isModerator } = useAuth()
  if (!ready) return <div style={{ padding: 12 }}>Loading auth…</div>
  if (!session) return <Navigate to="/" replace />
  if (requireModerator && !isModerator) return <Navigate to="/" replace />
  return <>{children}</>
}

// A simple layout component to wrap static pages with prose styling
function StaticPageLayout({ slug }: { slug: string }) {
  return (
    <div className="prose max-w-none">
      <StaticPage slug={slug} />
    </div>
  );
}

// A shared layout component for all pages
function Layout() {
  return (
    <>
      <AlertBanner />
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* Child routes will render here */}
          <Outlet />
        </div>
      </main>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Child routes of the layout */}
          <Route index element={<Feed />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="events" element={<Events />} />
          <Route path="businesses" element={<Businesses />} />
          <Route path="profile" element={<Profile />} />

          {/* Static Pages */}
          {['history', 'tourism', 'wildlife', 'earhart', 'harbour', 'faq', 'transport', 'schools', 'pembrey-country-park'].map(slug => (
            <Route
              key={slug}
              path={slug}
              element={<StaticPageLayout slug={slug} />}
            />
          ))}

          <Route path="recyclingHub" element={<RecyclingHub />} />

          <Route path="admin" element={<ProtectedRoute requireModerator><Admin /></ProtectedRoute>} />
          <Route path="AdminPages" element={<ProtectedRoute requireModerator><AdminPages /></ProtectedRoute>} />

          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
