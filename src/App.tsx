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
import StaticPage from './pages/StaticPage'
import AdminPages from './pages/AdminPages'
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
        <AlertBanner />
        <NavBar />
        <main className="max-w-4xl mx-auto px-4 py-6">
          <div className="space-y-6">
            <Routes>
            <Route path="/" element={<Feed />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/events" element={<Events />} />
            <Route path="/businesses" element={<Businesses />} />
            <Route path="/profile" element={<Profile />} />
            {/* Wrap static pages in a layout container with prose for styling */}
            <Route path="/history" element={<div className="prose max-w-none"><StaticPage slug="history" /></div>} />
            <Route path="/tourism" element={<div className="prose max-w-none"><StaticPage slug="tourism" /></div>} />
            <Route path="/wildlife" element={<div className="prose max-w-none"><StaticPage slug="wildlife" /></div>} />
            <Route path="/earhart" element={<div className="prose max-w-none"><StaticPage slug="earhart" /></div>} />
            <Route path="/harbour" element={<div className="prose max-w-none"><StaticPage slug="harbour" /></div>} />
            <Route path="/faq" element={<div className="prose max-w-none"><StaticPage slug="faq" /></div>} />
            <Route path="/transport" element={<div className="prose max-w-none"><StaticPage slug="transport" /></div>} />
            <Route path="/schools" element={<div className="prose max-w-none"><StaticPage slug="schools" /></div>} />
            <Route path="/pembrey-country-park" element={<div className="prose max-w-none"><StaticPage slug="pembrey-country-park" /></div>} />
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
        </main>
      </>
    </AuthProvider>
  )
}
