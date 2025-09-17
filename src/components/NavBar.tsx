import { Link, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from './AuthProvider'

export default function NavBar() {
  const { pathname } = useLocation()
  const { isModerator } = useAuth()
  const [open, setOpen] = useState(false)
  const [exploreOpen, setExploreOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Close menus on route change
  useEffect(() => {
    setOpen(false)
    setExploreOpen(false)
  }, [pathname])

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target as Node)) {
        setOpen(false)
        setExploreOpen(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const isActive = (to: string) => pathname === to

  const NavLink = ({ to, children }: { to: string; children: string }) => (
    <Link to={to} className={`px-4 py-2 rounded-md text-charcoal/80 hover:text-charcoal ${isActive(to) ? 'bg-sea/20 text-sea' : ''}`} onClick={() => setOpen(false)}>
      {children}
    </Link>
  )

  return (
    <header className="border-b border-sea/20 relative" ref={menuRef}>
      <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-charcoal hover:opacity-90">BurryPort.uk</Link>

        {/* Hamburger (mobile) */}
        <button
          aria-label="Toggle menu"
          aria-expanded={open}
          className="md:hidden inline-flex items-center justify-center w-10 h-10 border border-gray-300 rounded-md"
          onClick={() => setOpen((v) => !v)}
        >
          {/* simple hamburger icon */}
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18" stroke="#111" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Menu */}
        <nav className={`absolute md:relative top-full left-0 w-full md:w-auto bg-sand md:bg-transparent border-b md:border-none ${open ? 'block' : 'hidden'} md:block`} aria-label="Main">
          <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 p-2">
            <NavLink to="/feed">Feed</NavLink>
            <NavLink to="/alerts">Alerts</NavLink>
            <NavLink to="/events">Events</NavLink>
            <NavLink to="/businesses">Businesses</NavLink>
            <NavLink to="/profile">Profile</NavLink>
            {/* Explore dropdown */}
            <div className="relative inline-block">
              <button
                className="px-4 py-2 rounded-md bg-sand border border-gray-300 w-full text-left md:w-auto"
                aria-expanded={exploreOpen}
                aria-haspopup="true"
                onClick={() => setExploreOpen((v) => !v)}
              >
                Explore
              </button>
              {/* The actual dropdown menu */}
              <div className={`${exploreOpen ? 'block' : 'hidden'} absolute top-full left-0 mt-1 w-screen max-w-xs sm:max-w-sm z-10`} role="menu">
                <div className="grid grid-cols-2 gap-1 p-2 bg-sand border border-sea/20 rounded-lg shadow-lg">
                  <Link className="px-3 py-2 rounded-md text-gray-600 hover:bg-sand" to="/history">History</Link>
                  <Link className="px-3 py-2 rounded-md text-gray-600 hover:bg-sand" to="/tourism">Tourism</Link>
                  <Link className="px-3 py-2 rounded-md text-gray-600 hover:bg-sand" to="/wildlife">Wildlife</Link>
                  <Link className="px-3 py-2 rounded-md text-gray-600 hover:bg-sand" to="/earhart">Earhart</Link>
                  <Link className="px-3 py-2 rounded-md text-gray-600 hover:bg-sand" to="/harbour">Harbour</Link>
                  <Link className="px-3 py-2 rounded-md text-gray-600 hover:bg-sand" to="/faq">FAQ</Link>
                  <Link className="px-3 py-2 rounded-md text-gray-600 hover:bg-sand" to="/transport">Transport</Link>
                  <Link className="px-3 py-2 rounded-md text-gray-600 hover:bg-sand" to="/schools">Schools</Link>
                  <Link className="px-3 py-2 rounded-md text-gray-600 hover:bg-sand" to="/pembrey-country-park">Pembrey Park</Link>
                  <Link className="px-3 py-2 rounded-md text-gray-600 hover:bg-sand" to="/recyclingHub">Recycling</Link>
                  <Link className="px-3 py-2 rounded-md text-gray-600 hover:bg-sand" to="/tiers">Tiers</Link>
                </div>
              </div>
            </div>

            {/* Admin (only if moderator) */}
            {isModerator && <NavLink to="/admin">Admin</NavLink>}
            {isModerator && <NavLink to="/AdminPages">Pages Admin</NavLink>}
          </div>
        </nav>
      </div>
    </header>
  )
}
