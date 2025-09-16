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
      role="alert"
      onMouseEnter={() => { paused.current = true }}
      onMouseLeave={() => { paused.current = false }}
      className="sticky top-0 z-50 bg-amber-50 border-b border-amber-300"
    >
      <div className="max-w-4xl mx-auto px-3 py-2">
        <div className="flex gap-2 items-start border border-amber-400 bg-amber-100 p-2 rounded-lg">
          <button
            onClick={() => setIdx(i => (i - 1 + alerts.length) % alerts.length)}
            aria-label="Previous alert"
            className="border-none bg-transparent cursor-pointer text-lg p-1 opacity-75 hover:opacity-100"
          >‹</button>

          <span className="text-xs font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0">
            {a.category}
          </span>

          <div className="flex-1 leading-tight text-sm">
            <div className="font-bold text-amber-900">{a.title}</div>
            {a.body && <div className="opacity-85">{a.body}</div>}
            <div className="text-xs opacity-75 mt-0.5">
              {a.expires_at ? `expires ${new Date(a.expires_at).toLocaleString()}` : 'no expiry'}
            </div>
          </div>

          <button
            onClick={() => setIdx(i => (i + 1) % alerts.length)}
            aria-label="Next alert"
            className="border-none bg-transparent cursor-pointer text-lg p-1 opacity-75 hover:opacity-100"
          >›</button>

          <button
            onClick={() => hide(a.id)}
            title="Dismiss"
            className="border-none bg-transparent cursor-pointer text-lg p-1 opacity-75 hover:opacity-100"
            aria-label="Dismiss alert"
          >×</button>
        </div>

        {alerts.length > 1 && (
          <div className="flex gap-1.5 justify-center mt-1">
            {alerts.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} aria-label={`Go to alert ${i + 1}`} className={`w-2 h-2 rounded-full cursor-pointer ${i === idx ? 'bg-amber-500' : 'bg-amber-300 hover:bg-amber-400'}`} />
            ))}
          </div>
        )}

        {err && <div className="text-coral text-sm">{err}</div>}
      </div>
    </div>
  )
}
