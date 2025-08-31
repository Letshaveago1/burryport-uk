import { Link, useLocation } from 'react-router-dom'

export default function NavBar() {
  const { pathname } = useLocation()
  const link = (to: string, label: string) => (
    <Link
      to={to}
      style={{
        padding: '8px 12px',
        borderRadius: 8,
        textDecoration: 'none',
        color: pathname === to ? '#111' : '#444',
        background: pathname === to ? '#e5e7eb' : 'transparent'
      }}
    >
      {label}
    </Link>
  )
  return (
    <nav style={{display:'flex',gap:12,alignItems:'center',padding:'12px 0'}}>
      <div style={{fontWeight:700}}>BurryPort.uk</div>
      {link('/', 'Feed')}
      {link('/alerts', 'Alerts')}
      {link('/events', 'Events')}
      {link('/profile', 'Profile')}
    </nav>
  )
}
