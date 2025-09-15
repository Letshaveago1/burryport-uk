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
    <Link
      to={to}
      className={`bp-link ${isActive(to) ? 'is-active' : ''}`}
      onClick={() => setOpen(false)}
    >
      {children}
    </Link>
  )

  return (
    <header className="bp-nav-wrap" ref={menuRef}>
                <style>{`
          .bp-nav-wrap { border-bottom: 1px solid #e5e7eb; background:#fff; }
          .bp-container { max-width: 900px; margin: 0 auto; padding: 10px 12px; display:flex; align-items:center; justify-content:space-between; }
          .bp-brand { display:flex; align-items:center; gap:8px; font-weight:700; text-decoration:none; color:#111; }
          .bp-brand:hover { opacity:0.9; }
          .bp-toggle { display:inline-flex; align-items:center; justify-content:center; width:40px; height:40px; border:1px solid #e5e7eb; border-radius:8px; background:#fff; }
          .bp-toggle:active { transform:scale(0.98); }

          .bp-menu { display:none; }
          .bp-menu.open { display:block; }

          .bp-row { display:flex; gap:10px; flex-wrap:wrap; padding:8px 12px; }
          .bp-link { padding:8px 12px; border-radius:8px; text-decoration:none; color:#444; }
          .bp-link.is-active { background:#e5e7eb; color:#111; }

          /* Explore dropdown */
          .bp-dropdown { position:relative; display:inline-block; }
          .bp-dropbtn { padding:8px 12px; border-radius:8px; background:#f3f4f6; border:1px solid #e5e7eb; }

          /* Panel base */
          .bp-panel {
            position:absolute; top:calc(100% + 2px); left:0;  /* closer to button */
            width:min(92vw, 420px);
            border:1px solid #e5e7eb; border-radius:10px; padding:8px; background:#fff;
            box-shadow: 0 8px 24px rgba(0,0,0,0.08);
            display:none; z-index:1000;
            pointer-events:auto;
          }

          /* Open when toggled by state */
          .bp-panel.open { display:block; }

          /* Hover bridge to stop flicker */
          @media (hover: hover) {
            .bp-dropdown::after {
              content: "";
              position: absolute;
              left: 0;
              right: 0;
              top: 100%;
              height: 14px; /* invisible hover bridge thickness */
              pointer-events: none;
            }

            .bp-dropdown:hover .bp-panel,
            .bp-dropdown:focus-within .bp-panel { display:block; }
          }

          .bp-grid { display:grid; grid-template-columns: 1fr; gap:6px; }

          /* Mobile: fixed dropdown so Explore button never moves */
          @media (max-width: 719.98px) {
            .bp-dropdown { position:static; }
            .bp-panel {
              position:fixed;
              top:64px;  /* adjust to match your header height */
              left:12px;
              right:12px;
              width:auto;
              max-width:900px;
              margin:0 auto;
            }
          }

          /* Desktop */
          @media (min-width: 720px) {
            .bp-toggle { display:none; }
            .bp-menu { display:block !important; }
            .bp-row { align-items:center; padding:0; }
            .bp-grid { grid-template-columns: 1fr 1fr; }
          }
        `}</style>




      <div className="bp-container">
        <Link to="/" className="bp-brand">BurryPort.uk</Link>

        {/* Hamburger (mobile) */}
        <button
          aria-label="Toggle menu"
          aria-expanded={open}
          className="bp-toggle"
          onClick={() => setOpen(v => !v)}
        >
          {/* simple hamburger icon */}
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18" stroke="#111" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Menu */}
        <nav className={`bp-menu ${open ? 'open' : ''}`} aria-label="Main">
          <div className="bp-row">
            <NavLink to="/">Feed</NavLink>
            <NavLink to="/alerts">Alerts</NavLink>
            <NavLink to="/events">Events</NavLink>
            <NavLink to="/businesses">Businesses</NavLink>
            <NavLink to="/profile">Profile</NavLink>
            <NavLink to="/recyclingHub">Recycling</NavLink>
            {/* Explore dropdown */}
            <div className="bp-dropdown">
              <button
                className="bp-dropbtn"
                aria-expanded={exploreOpen}
                aria-haspopup="true"
                onClick={() => setExploreOpen(v => !v)}
              >
                Explore
              </button>
              <div className={`bp-panel ${exploreOpen ? 'open' : ''}`} role="menu">
                <div className="bp-grid">
                  <Link className="bp-link" to="/history">History</Link>
                  <Link className="bp-link" to="/tourism">Tourism</Link>
                  <Link className="bp-link" to="/wildlife">Wildlife</Link>
                  <Link className="bp-link" to="/earhart">Earhart</Link>
                  <Link className="bp-link" to="/harbour">Harbour</Link>
                  <Link className="bp-link" to="/faq">FAQ</Link>
                  <Link className="bp-link" to="/transport">Transport</Link>
                  <Link className="bp-link" to="/schools">Schools</Link>
                  <Link className="bp-link" to="/pembrey-country-park">Pembrey Park</Link>
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
