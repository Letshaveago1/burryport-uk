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
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-charcoal">Events</h2>

      {/* create form */}
      <div className="grid gap-4">
        <label htmlFor={idTitle} className="block text-sm font-medium text-gray-700">Event title
          <input id={idTitle} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Beach Clean" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-sea focus:border-sea sm:text-sm" />
        </label>

        <label htmlFor={idDesc} className="block text-sm font-medium text-gray-700">Description
          <textarea id={idDesc} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="What’s happening?" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-sea focus:border-sea sm:text-sm" />
        </label>

        <label htmlFor={idVenue} className="block text-sm font-medium text-gray-700">Venue
          <input id={idVenue} value={venue} onChange={e=>setVenue(e.target.value)} placeholder="e.g. Harbour Square" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-sea focus:border-sea sm:text-sm" />
        </label>

        <label htmlFor={idStarts} className="block text-sm font-medium text-gray-700">Starts at
          <input id={idStarts} type="datetime-local" value={starts} onChange={e=>setStarts(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-sea focus:border-sea sm:text-sm" />
        </label>

        <label htmlFor={idEnds} className="block text-sm font-medium text-gray-700">Ends at (optional)
          <input id={idEnds} type="datetime-local" value={ends} onChange={e=>setEnds(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-sea focus:border-sea sm:text-sm" />
        </label>

        <label htmlFor={idLink} className="block text-sm font-medium text-gray-700">Link (optional)
          <input id={idLink} type="url" value={link} onChange={e=>setLink(e.target.value)} placeholder="https://…" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-sea focus:border-sea sm:text-sm" />
        </label>

        <button type="button" disabled={!me || creating} onClick={createEvent} aria-busy={creating} className="w-full sm:w-auto px-6 py-2 bg-sea text-white font-semibold rounded-md shadow-sm hover:bg-opacity-90 disabled:bg-gray-400 disabled:cursor-not-allowed">
          {creating ? 'Creating…' : 'Create event'}
        </button>
      </div>

      {/* list */}
      <ul className="list-none p-0 flex flex-col gap-4">
        {events.map(ev => {
          const p = ev.organizer_id ? profiles[ev.organizer_id] : undefined
          const alt = p?.username ? `${p.username}'s avatar` : 'Organizer avatar'
          return (
            <li id={`event-${ev.id}`} key={ev.id} className="p-4 border border-sea/20 rounded-lg">
              <div className="flex items-center gap-3">
                <img
                  src={p?.avatar_url || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}
                  alt={alt}
                  className="w-8 h-8 rounded-full object-cover bg-gray-200"
                />
                <div>
                  <div className="font-semibold text-charcoal">{ev.title}</div>
                  <div className="text-xs text-gray-500">
                    {p?.username ? `@${p.username}` : '—'} · {new Date(ev.starts_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {ev.description && <div className="mt-2 whitespace-pre-wrap">{ev.description}</div>}
              <div className="text-xs text-gray-500 mt-2">
                {ev.venue || '—'}{ev.ends_at ? ` · ends ${new Date(ev.ends_at).toLocaleString()}` : ''}
                {ev.link ? <> · <a href={ev.link} target="_blank" rel="noreferrer" className="text-sea hover:underline">link</a></> : null}
              </div>

              {/* owner controls */}
              {me && ev.organizer_id === me && (
                <div className="mt-3">
                  <button type="button" onClick={()=>deleteEvent(ev.id)} aria-label={`Delete event ${ev.title}`} className="text-sm text-lighthouse hover:underline">Delete</button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      
      {err && <div className="text-lighthouse" aria-live="polite">{err}</div>}
    </div>
  )
}
