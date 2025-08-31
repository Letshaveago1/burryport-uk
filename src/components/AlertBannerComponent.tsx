// src/components/AlertBannerComponent.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type BannerAlert = {
  id: number
  category: 'transport' | 'closure' | 'lost_found' | 'weather' | 'general'
  title: string
  body: string | null
  priority: number
  expires_at: string | null
  created_at: string
}

const STORAGE_KEY = 'hiddenBannerAlerts'
const ROTATE_MS = 7000 // rotate every 7s

export function AlertBanner() {
  const [alerts, setAlerts] = useState<BannerAlert[]>([])
  const [idx, setIdx] = useState(0)
  const [err, setErr] = useState('')

  // per-alert expiry timers
  const timers = useRef<Record<number, number>>({})
  // rotation interval + pause-on-hover
  const rotateTimer = useRef<number | null>(null)
  const paused = useRef(false)

  // Hidden alert IDs (per browser)
  const hidden = useMemo<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return new Set<number>(raw ? JSON.parse(raw) : [])
    } catch {
      return new Set<number>()
    }
  }, [])
  const persistHidden = (s: Set<number>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(s)))
    } catch {}
  }

  const stillValid = (a: BannerAlert) =>
    a.priority === 1 &&
    !hidden.has(a.id) &&
    (!a.expires_at || new Date(a.expires_at).getTime() > Date.now())

  const scheduleExpiry = (a: BannerAlert) => {
    // clear any previous timer for this id
    if (timers.current[a.id]) {
      window.clearTimeout(timers.current[a.id])
      delete timers.current[a.id]
    }
    if (a.expires_at) {
      const ms = new Date(a.expires_at).getTime() - Date.now()
      if (ms > 0) {
        timers.current[a.id] = window.setTimeout(() => {
          setAlerts(prev => prev.filter(p => p.id !== a.id))
          delete timers.current[a.id]
        }, ms)
      }
    }
  }

  async function fetchTopAlerts() {
    try {
      const { data, error } = await supabase
        .from('alerts')
        .select('id,category,title,body,priority,expires_at,created_at')
        .eq('priority', 1)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      const rows = (data as BannerAlert[]).filter(stillValid)
      setAlerts(rows)
      setIdx(0)
      rows.forEach(scheduleExpiry)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    }
  }

  // Initial fetch + realtime listeners
  useEffect(() => {
    fetchTopAlerts()

    const ch = supabase
      .channel('alerts-banner-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'app', table: 'alerts' }, (payload) => {
        const a = payload.new as BannerAlert
        if (stillValid(a)) {
          setAlerts(prev => [a, ...prev.filter(p => p.id !== a.id)])
          scheduleExpiry(a)
          setIdx(0) // show newest first
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'app', table: 'alerts' }, (payload) => {
        const a = payload.new as BannerAlert
        setAlerts(prev => {
          const rest = prev.filter(p => p.id !== a.id)
          return stillValid(a) ? [a, ...rest] : rest
        })
        if (stillValid(a)) scheduleExpiry(a)
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'app', table: 'alerts' }, (payload) => {
        const id = (payload.old as { id: number }).id
        setAlerts(prev => prev.filter(p => p.id !== id))
        if (timers.current[id]) {
          window.clearTimeout(timers.current[id])
          delete timers.current[id]
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [])

  // Keep index in range when list size changes
  useEffect(() => {
    setIdx(i => (alerts.length === 0 ? 0 : Math.min(i, alerts.length - 1)))
  }, [alerts.length])

  // Auto-rotate through alerts
  useEffect(() => {
    if (rotateTimer.current) {
      window.clearInterval(rotateTimer.current)
      rotateTimer.current = null
    }
    if (alerts.length > 1) {
      rotateTimer.current = window.setInterval(() => {
        if (!paused.current) {
          setIdx(i => (i + 1) % alerts.length)
        }
      }, ROTATE_MS)
    }
    return () => {
      if (rotateTimer.current) {
        window.clearInterval(rotateTimer.current)
        rotateTimer.current = null
      }
    }
  }, [alerts.length])

  // Cleanup all expiry timers on unmount
  useEffect(() => {
    return () => {
      Object.keys(timers.current).forEach(k => {
        window.clearTimeout(timers.current[+k])
        delete timers.current[+k]
      })
    }
  }, [])

  const hide = (id: number) => {
    hidden.add(id)
    persistHidden(hidden)
    setAlerts(a => a.filter(x => x.id !== id))
    if (timers.current[id]) {
      window.clearTimeout(timers.current[id])
      delete timers.current[id]
    }
  }

  if (alerts.length === 0) return null
  const a = alerts[idx]

  return (
    <div
      onMouseEnter={() => { paused.current = true }}
      onMouseLeave={() => { paused.current = false }}
      style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: '#FFFBEB', borderBottom: '1px solid #FCD34D'
      }}
    >
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '8px 12px' }}>
        <div style={{
          display: 'flex', gap: 8, alignItems: 'start',
          border: '1px solid #FACC15', background: '#FEF3C7',
          padding: '8px 10px', borderRadius: 8
        }}>
          <button
            onClick={() => setIdx(i => (i - 1 + alerts.length) % alerts.length)}
            aria-label="Previous alert"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, padding: 4, opacity: 0.75 }}
          >‹</button>

          <span style={{
            fontSize: 12, fontWeight: 700, background: '#F59E0B', color: 'white',
            padding: '2px 6px', borderRadius: 6, marginTop: 2, flex: '0 0 auto'
          }}>
            {a.category}
          </span>

          <div style={{ flex: 1, lineHeight: 1.2 }}>
            <div style={{ fontWeight: 700 }}>{a.title}</div>
            {a.body && <div style={{ opacity: 0.85 }}>{a.body}</div>}
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
              {a.expires_at ? `expires ${new Date(a.expires_at).toLocaleString()}` : 'no expiry'}
            </div>
          </div>

          <button
            onClick={() => setIdx(i => (i + 1) % alerts.length)}
            aria-label="Next alert"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, padding: 4, opacity: 0.75 }}
          >›</button>

          <button
            onClick={() => hide(a.id)}
            title="Dismiss"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, padding: 4, opacity: 0.75 }}
            aria-label="Dismiss alert"
          >×</button>
        </div>

        {alerts.length > 1 && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 4 }}>
            {alerts.map((_, i) => (
              <span
                key={i}
                onClick={() => setIdx(i)}
                style={{
                  width: 8, height: 8, borderRadius: 9999,
                  background: i === idx ? '#F59E0B' : '#FCD34D',
                  cursor: 'pointer'
                }}
              />
            ))}
          </div>
        )}

        {err && <div style={{ color: '#b00020' }}>{err}</div>}
      </div>
    </div>
  )
}
