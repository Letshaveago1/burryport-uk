// src/App.tsx
import { Route, Routes, Navigate } from 'react-router-dom'
import { AlertBanner } from './components/AlertBannerComponent' // ← see step 2 import
import NavBar from './components/NavBar'
import Feed from './pages/Feed'
import Alerts from './pages/Alerts'
import Events from './pages/Events'
import Profile from './pages/Profile'
import Businesses from './pages/Businesses'
import './App.css'


export default function App() {
  return (
    <>
      <AlertBanner /> {/* full-width, sticky at top */}
      <div style={{ maxWidth: 900, margin: '32px auto', fontFamily: 'system-ui, sans-serif' }}>
        <NavBar />
        <Routes>
          <Route path="/" element={<Feed />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/events" element={<Events />} />
          <Route path="/businesses" element={<Businesses />} />
          <Route path="/profile" element={<Profile />} /> 
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  )
}
