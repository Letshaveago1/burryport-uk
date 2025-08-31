import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type AlertRow = {
  id: number
  category: 'transport' | 'closure' | 'lost_found' | 'weather' | 'general'
  title: string
  body: string | null
  priority: number
  expires_at: string | null
  created_at: string
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [cat, setCat] = useState<AlertRow['category']>('general')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [exp, setExp] = useState('') // datetime-local
  const [isPriority, setIsPriority] = useState(false) // <-- NEW
  const [err, setErr] = useState('')

  const showErr = (e: any) => setErr(e?.message ?? String(e))

  async function fetchAlerts() {
    try {
      const { data, error } = await supabase
        .from('alerts')
        .select('id,category,title,body,priority,expires_at,created_at')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      setAlerts(data as AlertRow[])
    } catch (e) { showErr(e) }
  }

  useEffect(() => {
    fetchAlerts()
    const ch = supabase
      .channel('alerts-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'app', table: 'alerts' }, (payload) => {
        setAlerts(prev => [payload.new as AlertRow, ...prev])
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function createAlert() {
    try {
      const { data: me } = await supabase.auth.getUser()
      if (!me.user) throw new Error('Sign in first')
      const expires_at = exp ? new Date(exp).toISOString() : null
      const { error } = await supabase
        .from('alerts')
        .insert([{
          author_id: me.user.id,
          category: cat,
          title,
          body,
          expires_at,
          priority: isPriority ? 1 : 0  // <-- NEW
        }])
      if (error) throw error
      setTitle(''); setBody(''); setExp(''); setIsPriority(false)
    } catch (e) { showErr(e) }
  }

  return (
    <div>
      <h2>Alerts</h2>
      <div style={{ display: 'grid', gap: 8, margin: '8px 0' }}>
        <select value={cat} onChange={(e) => setCat(e.target.value as AlertRow['category'])}>
          <option value="general">general</option>
          <option value="transport">transport</option>
          <option value="closure">closure</option>
          <option value="lost_found">lost_found</option>
          <option value="weather">weather</option>
        </select>

        <input placeholder="Alert title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea placeholder="Alert body" value={body} onChange={(e) => setBody(e.target.value)} />

        <label>Expires at</label>
        <input type="datetime-local" value={exp} onChange={(e) => setExp(e.target.value)} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={isPriority}
            onChange={(e) => setIsPriority(e.target.checked)}
          />
          High priority (show in banner)
        </label>

        <button onClick={createAlert} disabled={!title.trim()}>Create alert</button>
      </div>

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
        {alerts.map((a) => (
          <li key={a.id} style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8 }}>
            <div style={{ fontWeight: 600 }}>[{a.category}] {a.title}</div>
            {a.body && <div style={{ whiteSpace: 'pre-wrap' }}>{a.body}</div>}
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {a.expires_at ? 'expires ' + new Date(a.expires_at).toLocaleString() : 'no expiry'}
              {' · '}priority {a.priority}
            </div>
          </li>
        ))}
      </ul>

      {err && <div style={{ color: '#b00020' }}>{err}</div>}
    </div>
  )
}
