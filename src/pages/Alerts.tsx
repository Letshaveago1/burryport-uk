import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type AlertRow = {
  id:number
  author_id: string | null
  category:'transport'|'closure'|'lost_found'|'weather'|'general'
  title:string
  body:string|null
  priority:number
  expires_at:string|null
  created_at:string
}

type Profile = { user_id:string; username:string|null; avatar_url:string|null }

export default function Alerts() {
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [me, setMe] = useState<string | null>(null)
  const [isMod, setIsMod] = useState(false)
  const [err, setErr] = useState('')

  // form
  const [cat, setCat] = useState<'transport'|'closure'|'lost_found'|'weather'|'general'>('general')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [exp, setExp] = useState('')
  const [creating, setCreating] = useState(false)

  const showErr = (e:any)=> setErr(e?.message ?? String(e))

  async function loadMe() {
    const { data } = await supabase.auth.getUser()
    const uid = data.user?.id ?? null
    setMe(uid)
    if (uid) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('is_moderator')
        .eq('user_id', uid)
        .single()
      setIsMod(!!(prof as any)?.is_moderator)
    }
  }

  async function loadAlerts() {
    try {
      const { data, error } = await supabase
        .from('alerts')
        .select('id,author_id,category,title,body,priority,expires_at,created_at')
        .order('created_at', { ascending:false })
        .limit(100)
      if (error) throw error
      setAlerts(data as AlertRow[])
    } catch (e){ showErr(e) }
  }

  const authorIds = useMemo(
    () => Array.from(new Set(alerts.map(a => a.author_id).filter(Boolean))) as string[],
    [alerts]
  )

  useEffect(() => {
    (async () => {
      if (authorIds.length === 0) { setProfiles({}); return }
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id,username,avatar_url')
        .in('user_id', authorIds)
      if (!error && data) {
        const map: Record<string, Profile> = {}
        ;(data as Profile[]).forEach(p => { map[p.user_id] = p })
        setProfiles(map)
      }
    })()
  }, [authorIds.join('|')])

  useEffect(() => {
    loadMe()
    loadAlerts()
    const ch = supabase
      .channel('alerts-rt-full')
      .on('postgres_changes', { event:'INSERT', schema:'app', table:'alerts' }, payload => {
        setAlerts(prev => [payload.new as AlertRow, ...prev])
      })
      .on('postgres_changes', { event:'UPDATE', schema:'app', table:'alerts' }, payload => {
        const row = payload.new as AlertRow
        setAlerts(prev => prev.map(a => a.id === row.id ? row : a))
      })
      .on('postgres_changes', { event:'DELETE', schema:'app', table:'alerts' }, payload => {
        const id = (payload.old as {id:number}).id
        setAlerts(prev => prev.filter(a => a.id !== id))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function createAlert() {
    try {
      const { data: meUser } = await supabase.auth.getUser()
      if (!meUser.user) throw new Error('Sign in first')
      setCreating(true)
      const expires_at = exp ? new Date(exp).toISOString() : null
      const { error } = await supabase
        .from('alerts')
        .insert([{ author_id: meUser.user.id, category:cat, title, body, expires_at, priority:0 }])
      if (error) throw error
      setTitle(''); setBody(''); setExp('')
    } catch (e){ showErr(e) } finally { setCreating(false) }
  }

  async function togglePriority(a: AlertRow) {
    try {
      const { error } = await supabase
        .from('alerts')
        .update({ priority: a.priority === 1 ? 0 : 1 })
        .eq('id', a.id)
      if (error) throw error
    } catch (e){ showErr(e) }
  }

  async function deleteAlert(id:number) {
    try {
      const { error } = await supabase.from('alerts').delete().eq('id', id)
      if (error) throw error
    } catch (e){ showErr(e) }
  }

  return (
    <div>
      <h2>Alerts</h2>

      {/* create form */}
      <div style={{display:'grid',gap:8,margin:'12px 0'}}>
        <select value={cat} onChange={e=>setCat(e.target.value as any)}>
          <option value="general">general</option>
          <option value="transport">transport</option>
          <option value="closure">closure</option>
          <option value="lost_found">lost_found</option>
          <option value="weather">weather</option>
        </select>
        <input placeholder="Alert title" value={title} onChange={e=>setTitle(e.target.value)} />
        <textarea placeholder="Alert body" value={body} onChange={e=>setBody(e.target.value)} />
        <label>Expires at</label>
        <input type="datetime-local" value={exp} onChange={e=>setExp(e.target.value)} />
        <button disabled={!me || creating} onClick={createAlert}>{creating ? 'Creating…' : 'Create alert'}</button>
      </div>

      <ul style={{listStyle:'none',padding:0,display:'grid',gap:12}}>
        {alerts.map(a => {
          const p = a.author_id ? profiles[a.author_id] : undefined
          const mine = me && a.author_id === me
          return (
            <li key={a.id} style={{padding:12,border:'1px solid #e5e7eb',borderRadius:8}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <img
                  src={p?.avatar_url || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}
                  alt="" style={{width:28,height:28,borderRadius:'50%',objectFit:'cover',background:'#eee'}}
                />
                <div style={{fontWeight:600}}>
                  [{a.category}] {a.title} {a.priority === 1 && <span style={{fontSize:12,color:'#b45309'}}>• HIGH</span>}
                  <div style={{fontWeight:400,fontSize:12,opacity:0.7}}>
                    {p?.username ? `@${p.username}` : '—'} · {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {a.body && <div style={{marginTop:6,whiteSpace:'pre-wrap'}}>{a.body}</div>}
              <div style={{fontSize:12,opacity:0.75,marginTop:6}}>
                {a.expires_at ? `expires ${new Date(a.expires_at).toLocaleString()}` : 'no expiry'}
              </div>

              <div style={{marginTop:8,display:'flex',gap:8}}>
                {mine && <button onClick={()=>deleteAlert(a.id)}>Delete</button>}
                {isMod && (
                  <button onClick={()=>togglePriority(a)}>
                    {a.priority === 1 ? 'Unmark High Priority' : 'Mark High Priority'}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {err && <div style={{color:'#b00020'}}>{err}</div>}
    </div>
  )
}
