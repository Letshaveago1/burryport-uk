import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type EventRow = {
  id: number
  title: string
  description: string | null
  venue: string | null
  starts_at: string
  ends_at: string | null
  link: string | null
}

export default function Events() {
  const [rows, setRows] = useState<EventRow[]>([])
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [venue, setVenue] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [link, setLink] = useState('')
  const [err, setErr] = useState('')

  const showErr = (e:any)=> setErr(e?.message ?? String(e))

  async function fetchEvents(){
    try{
      const since = new Date(Date.now() - 24*60*60*1000).toISOString()
      const { data, error } = await supabase
        .from('events')
        .select('id,title,description,venue,starts_at,ends_at,link')
        .gte('starts_at', since)
        .order('starts_at', { ascending: true })
        .limit(100)
      if (error) throw error
      setRows(data as EventRow[])
    }catch(e){ showErr(e) }
  }

  useEffect(()=>{ fetchEvents() },[])

  async function createEvent(){
    try{
      const { data: me } = await supabase.auth.getUser()
      if(!me.user) throw new Error('Sign in first')
      if(!start) throw new Error('Starts at is required')
      const starts_at = new Date(start).toISOString()
      const ends_at = end ? new Date(end).toISOString() : null
      const { error } = await supabase
        .from('events')
        .insert([{ organizer_id: me.user.id, title, description:desc, venue, starts_at, ends_at, link: link || null }])
      if (error) throw error
      setTitle(''); setDesc(''); setVenue(''); setStart(''); setEnd(''); setLink('')
      fetchEvents()
    }catch(e){ showErr(e) }
  }

  return (
    <div>
      <h2>Events</h2>
      <div style={{display:'grid',gap:8,margin:'8px 0'}}>
        <input placeholder="Event title" value={title} onChange={e=>setTitle(e.target.value)} />
        <textarea placeholder="Description" value={desc} onChange={e=>setDesc(e.target.value)} />
        <input placeholder="Venue" value={venue} onChange={e=>setVenue(e.target.value)} />
        <label>Starts at</label>
        <input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} />
        <label>Ends at (optional)</label>
        <input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} />
        <input placeholder="Link (optional)" value={link} onChange={e=>setLink(e.target.value)} />
        <button onClick={createEvent}>Create event</button>
      </div>

      <ul style={{listStyle:'none',padding:0,display:'grid',gap:12}}>
        {rows.map(ev => (
          <li key={ev.id} style={{padding:12,border:'1px solid #e5e7eb',borderRadius:8}}>
            <div style={{fontWeight:600}}>{ev.title}</div>
            {ev.description && <div style={{whiteSpace:'pre-wrap'}}>{ev.description}</div>}
            <div style={{fontSize:12,opacity:0.7}}>
              {ev.venue ? ev.venue + ' · ' : ''}
              {new Date(ev.starts_at).toLocaleString()}
              {ev.ends_at ? ' → ' + new Date(ev.ends_at).toLocaleString() : ''}
            </div>
            {ev.link && <a href={ev.link} target="_blank">More info</a>}
          </li>
        ))}
      </ul>
      {err && <div style={{color:'#b00020'}}>{err}</div>}
    </div>
  )
}
