// src/App.tsx
import { Route, Routes, Navigate, Outlet } from 'react-router-dom'
import { AlertBanner } from './components/layout/AlertBanner'
import NavBar from './components/layout/NavBar'
import Feed from './pages/Feed'
import Alerts from './pages/Alerts'
import Events from './pages/Events'
import Businesses from './pages/Businesses'
import Admin from './pages/Admin'
import Profile from './pages/Profile'
import AuthProvider, { useAuth } from './components/auth/AuthProvider'
import type { ReactNode } from 'react'
import StaticPage from './pages/StaticPage'
import AdminPages from './pages/AdminPages'
import RecyclingHub from './pages/RecyclingHub'
import TiersPage from './pages/Tiers'
import Home from "./pages/Home";
import OnboardingPage from "./pages/Onboarding";
import LoginPage from './pages/Login'
import SignupPage from './pages/Signup'
import Footer from './components/layout/Footer'


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
  return <StaticPage slug={slug} />;
}

// A shared layout component for all pages
function Layout() {
  return (
    <div className="flex flex-col min-h-screen bg-sand text-charcoal">
      <AlertBanner />
      <NavBar />
      <main className="flex-grow max-w-4xl mx-auto px-4 py-6 w-full">
        {/* Child routes will render here */}
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      {/* The outer div has been moved into the Layout component */}
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Child routes of the layout */}
          <Route index element={<Home />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="signup" element={<SignupPage />} />
          <Route path="feed" element={<Feed />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="events" element={<Events />} />
          <Route path="businesses" element={<Businesses />} />
          <Route path="profile" element={<Profile />} />

          {/* Static Pages */}
          {[
            'history', 'tourism', 'wildlife', 'earhart', 'harbour', 'faq', 'transport', 'schools', 'pembrey-country-park',
            'terms', 'privacy-policy', 'rules'
          ].map(slug => (
            <Route
              key={slug}
              path={slug}
              element={<StaticPageLayout slug={slug} />}
            />
          ))}

          <Route path="recyclingHub" element={<RecyclingHub />} />
          <Route path="tiers" element={<TiersPage />} />
          <Route path="start" element={<OnboardingPage />} />

          <Route path="admin" element={<ProtectedRoute requireModerator><Admin /></ProtectedRoute>} />
          <Route path="AdminPages" element={<ProtectedRoute requireModerator><AdminPages /></ProtectedRoute>} />

          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
