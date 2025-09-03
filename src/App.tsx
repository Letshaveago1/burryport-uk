// src/App.tsx
import { Route, Routes, Navigate } from 'react-router-dom'
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

function ProtectedRoute({
  children,
  requireModerator = false,
}: {
  children: ReactNode
  requireModerator?: boolean
}) {
  const { ready, session, isModerator } = useAuth()
  if (!ready) return <div style={{ padding: 12 }}>Loading auth…</div>
  if (!session) return <Navigate to="/" replace />
  if (requireModerator && !isModerator) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <>
        <AlertBanner />
        <div style={{ maxWidth: 900, margin: '32px auto', fontFamily: 'system-ui, sans-serif' }}>
          <NavBar />
          <Routes>
            <Route path="/" element={<Feed />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/events" element={<Events />} />
            <Route path="/businesses" element={<Businesses />} />
            <Route path="/profile" element={<Profile />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireModerator>
                  <Admin />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </>
    </AuthProvider>
  )
}
