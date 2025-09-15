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
import LiveRailBanner from './components/LiveRailBanner'
import StaticPage from './pages/StaticPage'
import AdminPages from './pages/AdminPages' // Import PagesAdmin component
import RecyclingHub from './pages/RecyclingHub'


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
        <div style={{ position: 'sticky', top: 0, zIndex: 50 }}></div> 
        <AlertBanner />
        <LiveRailBanner />
        <div style={{ maxWidth: 900, margin: '32px auto', fontFamily: 'system-ui, sans-serif' }}>
          <NavBar />
          <Routes>
            <Route path="/" element={<Feed />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/events" element={<Events />} />
            <Route path="/businesses" element={<Businesses />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/history" element={<StaticPage slug="history" />} />
            <Route path="/tourism" element={<StaticPage slug="tourism" />} />
            <Route path="/wildlife" element={<StaticPage slug="wildlife" />} />
            <Route path="/earhart" element={<StaticPage slug="earhart" />} />
            <Route path="/harbour" element={<StaticPage slug="harbour" />} />
            <Route path="/faq" element={<StaticPage slug="faq" />} />
            <Route path="/transport" element={<StaticPage slug="transport" />} />
            <Route path="/schools" element={<StaticPage slug="schools" />} />
            <Route path="/pembrey-country-park" element={<StaticPage slug="pembrey-country-park" />} />
            <Route path="/recyclingHub" element={<RecyclingHub />} />

          <Route
              path="/admin"
              element={
                <ProtectedRoute requireModerator>
                  <Admin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/AdminPages"
              element={
                <ProtectedRoute requireModerator>
                  <AdminPages />
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
