import { useEffect, useMemo, useState, useId } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useHead } from '../lib/seo'
import { siteBase } from '../lib/schema'

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

  const idTitle = useId()
  const idDesc = useId()
  const idVenue = useId()
  const idStarts = useId()
  const idEnds = useId()
  const idLink = useId()

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

  // ----------------- AIO / SEO layer -----------------
  const canonical = `${siteBase}/events`
  const pageTitle = 'Events in Burry Port – What’s On'
  const pageDesc = events.length
    ? `Upcoming events in Burry Port, next up: ${events.slice(0,2).map(e=>e.title).join(' • ')}`
    : 'Upcoming events in Burry Port: community, sports, beach and harbour activities.'

  // Build Event JSON-LD for each event + an ItemList wrapper
  const eventsJsonLd = useMemo(() => {
    const listItems = events.map((ev, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      url: `${canonical}#event-${ev.id}`
    }))

    const eventBlocks = events.map((ev) => {
      const startISO = new Date(ev.starts_at).toISOString()
      const endISO = ev.ends_at ? new Date(ev.ends_at).toISOString() : undefined
      const url = `${canonical}#event-${ev.id}`

      // Minimal, valid Event schema
      const block: any = {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: ev.title,
        description: ev.description || undefined,
        startDate: startISO,
        endDate: endISO,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        url,
      }
      if (ev.venue) {
        block.location = {
          '@type': 'Place',
          name: ev.venue,
          address: { '@type': 'PostalAddress', addressLocality: 'Burry Port', addressRegion: 'Carmarthenshire', addressCountry: 'GB' }
        }
      }
      if (ev.link) {
        block.offers = { '@type': 'Offer', url: ev.link, availability: 'https://schema.org/InStock' }
      }
      return block
    })

    const itemList = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: listItems,
      url: canonical,
      name: 'Events in Burry Port'
    }

    return [itemList, ...eventBlocks]
  }, [JSON.stringify(events)])

  // Default OG image (you set this up already)
  const ogImage = `${siteBase}/og/default.jpg`

  useHead({
    title: pageTitle,
    description: pageDesc,
    canonical,
    metas: [
      { property: 'og:title', content: pageTitle },
      { property: 'og:description', content: pageDesc },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: ogImage },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: ogImage },
    ],
    jsonLd: eventsJsonLd,
  })
  // ----------------- end AIO / SEO layer -------------

  return (
    <div>
      <h2>Events</h2>

      {/* create form */}
      <div style={{display:'grid',gap:8,margin:'12px 0'}}>
        <label htmlFor={idTitle}>Event title</label>
        <input id={idTitle} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Beach Clean" />

        <label htmlFor={idDesc}>Description</label>
        <textarea id={idDesc} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="What’s happening?" />

        <label htmlFor={idVenue}>Venue</label>
        <input id={idVenue} value={venue} onChange={e=>setVenue(e.target.value)} placeholder="e.g. Harbour Square" />

        <label htmlFor={idStarts}>Starts at</label>
        <input id={idStarts} type="datetime-local" value={starts} onChange={e=>setStarts(e.target.value)} />

        <label htmlFor={idEnds}>Ends at (optional)</label>
        <input id={idEnds} type="datetime-local" value={ends} onChange={e=>setEnds(e.target.value)} />

        <label htmlFor={idLink}>Link (optional)</label>
        <input id={idLink} type="url" value={link} onChange={e=>setLink(e.target.value)} placeholder="https://…" />

        <button type="button" disabled={!me || creating} onClick={createEvent} aria-busy={creating}>
          {creating ? 'Creating…' : 'Create event'}
        </button>
      </div>

      {/* list */}
      <ul style={{listStyle:'none',padding:0,display:'grid',gap:12}}>
        {events.map(ev => {
          const p = ev.organizer_id ? profiles[ev.organizer_id] : undefined
          const alt = p?.username ? `${p.username}'s avatar` : 'Organizer avatar'
          return (
            <li id={`event-${ev.id}`} key={ev.id} style={{padding:12,border:'1px solid #e5e7eb',borderRadius:8}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <img
                  src={p?.avatar_url || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}
                  alt={alt}
                  style={{width:28,height:28,borderRadius:'50%',objectFit:'cover',background:'#eee'}}
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
                  <button type="button" onClick={()=>deleteEvent(ev.id)} aria-label={`Delete event ${ev.title}`}>Delete</button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {err && <div style={{color:'#b00020'}} aria-live="polite">{err}</div>}
    </div>
  )
}
