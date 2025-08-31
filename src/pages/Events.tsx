import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type EventRow = {
  id: number
  organizer_id: string | null
  title: string
  description: string | null
  venue: string | null
  starts_at: string
  ends_at: string | null
  link: string | null
  created_at: string
}

type Profile = { user_id: string; username: string | null; avatar_url: string | null }

export default function Events() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [err, setErr] = useState('')
  const [me, setMe] = useState<string | null>(null)

  // form
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [venue, setVenue] = useState('')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [link, setLink] = useState('')
  const [creating, setCreating] = useState(false)

  const showErr = (e:any)=> setErr(e?.message ?? String(e))

  async function loadEvents() {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('id,organizer_id,title,description,venue,starts_at,ends_at,link,created_at')
        .gte('starts_at', new Date(Date.now() - 24*60*60*1000).toISOString()) // show from yesterday forward
        .order('starts_at', { ascending: true })
        .limit(100)
      if (error) throw error
      setEvents(data as EventRow[])
    } catch (e) { showErr(e) }
  }

  async function loadMe() {
    const { data } = await supabase.auth.getUser()
    setMe(data.user?.id ?? null)
  }

  // fetch organizer profiles for all visible events (1 query)
  const organizerIds = useMemo(
    () => Array.from(new Set(events.map(e => e.organizer_id).filter(Boolean))) as string[],
    [events]
  )

  useEffect(() => {
    (async () => {
      if (organizerIds.length === 0) { setProfiles({}); return }
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id,username,avatar_url')
        .in('user_id', organizerIds)
      if (!error && data) {
        const map: Record<string, Profile> = {}
        ;(data as Profile[]).forEach(p => { map[p.user_id] = p })
        setProfiles(map)
      }
    })()
  }, [organizerIds.join('|')])

  useEffect(() => {
    loadMe()
    loadEvents()
    const ch = supabase
      .channel('events-rt')
      .on('postgres_changes', { event:'INSERT', schema:'app', table:'events' }, (payload) => {
        setEvents(prev => {
          const next = [...prev, payload.new as EventRow].sort((a,b)=>a.starts_at.localeCompare(b.starts_at))
          return next
        })
      })
      .on('postgres_changes', { event:'UPDATE', schema:'app', table:'events' }, (payload) => {
        const row = payload.new as EventRow
        setEvents(prev => prev.map(e => e.id === row.id ? row : e))
      })
      .on('postgres_changes', { event:'DELETE', schema:'app', table:'events' }, (payload) => {
        const id = (payload.old as {id:number}).id
        setEvents(prev => prev.filter(e => e.id !== id))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function createEvent() {
    try {
      if (!me) throw new Error('Sign in first')
      if (!title.trim() || !starts) throw new Error('Title and start time required')
      setCreating(true)
      const starts_at = new Date(starts).toISOString()
      const ends_at = ends ? new Date(ends).toISOString() : null
      const { error } = await supabase
        .from('events')
        .insert([{ organizer_id: me, title, description: desc, venue, starts_at, ends_at, link }])
      if (error) throw error
      setTitle(''); setDesc(''); setVenue(''); setStarts(''); setEnds(''); setLink('')
    } catch (e) { showErr(e) }
    finally { setCreating(false) }
  }

  async function deleteEvent(id:number) {
    try {
      const { error } = await supabase.from('events').delete().eq('id', id)
      if (error) throw error
    } catch (e) { showErr(e) }
  }

  return (
    <div>
      <h2>Events</h2>

      {/* create form */}
      <div style={{display:'grid',gap:8,margin:'12px 0'}}>
        <input placeholder="Event title" value={title} onChange={e=>setTitle(e.target.value)} />
        <textarea placeholder="Description" value={desc} onChange={e=>setDesc(e.target.value)} />
        <input placeholder="Venue" value={venue} onChange={e=>setVenue(e.target.value)} />
        <label>Starts at</label>
        <input type="datetime-local" value={starts} onChange={e=>setStarts(e.target.value)} />
        <label>Ends at (optional)</label>
        <input type="datetime-local" value={ends} onChange={e=>setEnds(e.target.value)} />
        <input placeholder="Link (optional)" value={link} onChange={e=>setLink(e.target.value)} />
        <button disabled={!me || creating} onClick={createEvent}>{creating ? 'Creating…' : 'Create event'}</button>
      </div>

      {/* list */}
      <ul style={{listStyle:'none',padding:0,display:'grid',gap:12}}>
        {events.map(ev => {
          const p = ev.organizer_id ? profiles[ev.organizer_id] : undefined
          return (
            <li key={ev.id} style={{padding:12,border:'1px solid #e5e7eb',borderRadius:8}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <img
                  src={p?.avatar_url || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}
                  alt="" style={{width:28,height:28,borderRadius:'50%',objectFit:'cover',background:'#eee'}}
                />
                <div>
                  <div style={{fontWeight:600}}>{ev.title}</div>
                  <div style={{fontSize:12,opacity:0.7}}>
                    {p?.username ? `@${p.username}` : '—'} · {new Date(ev.starts_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {ev.description && <div style={{marginTop:6,whiteSpace:'pre-wrap'}}>{ev.description}</div>}
              <div style={{fontSize:12,opacity:0.75,marginTop:6}}>
                {ev.venue || '—'}{ev.ends_at ? ` · ends ${new Date(ev.ends_at).toLocaleString()}` : ''}
                {ev.link ? <> · <a href={ev.link} target="_blank" rel="noreferrer">link</a></> : null}
              </div>

              {/* owner controls */}
              {me && ev.organizer_id === me && (
                <div style={{marginTop:8}}>
                  <button onClick={()=>deleteEvent(ev.id)}>Delete</button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {err && <div style={{color:'#b00020'}}>{err}</div>}
    </div>
  )
}
