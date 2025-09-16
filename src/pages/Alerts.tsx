import { useEffect, useMemo, useState, useId } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useHead } from '../lib/seo'
import { siteBase } from '../lib/schema'

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

  const idCat = useId()
  const idTitle = useId()
  const idBody = useId()
  const idExpires = useId()

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

  // ----------------- AIO / SEO layer -----------------
  const canonical = `${siteBase}/alerts`
  const pageTitle = 'Burry Port Alerts – Closures, Weather, Transport'
  const top = alerts.slice(0, 3).map(a => a.title).join(' • ')
  const pageDesc = top
    ? `Latest local alerts: ${top}`
    : 'Live local alerts for Burry Port: closures, weather, transport and community notices.'

  // Build SpecialAnnouncement (or fallback) + ItemList
  const jsonBlocks = useMemo(() => {
    const list = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Burry Port Alerts',
      url: canonical,
      itemListElement: alerts.map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${canonical}#alert-${a.id}`
      }))
    }

    const perAlert = alerts.map(a => {
      const url = `${canonical}#alert-${a.id}`
      const block: any = {
        '@context': 'https://schema.org',
        '@type': 'SpecialAnnouncement',
        name: a.title,
        text: a.body || a.title,
        datePosted: new Date(a.created_at).toISOString(),
        url,
        category: a.category,
      }
      if (a.expires_at) block.expires = new Date(a.expires_at).toISOString()
      // You can hint audience/location if you like:
      block.spatialCoverage = {
        '@type': 'Place',
        name: 'Burry Port',
        address: { '@type': 'PostalAddress', addressLocality: 'Burry Port', addressRegion: 'Carmarthenshire', addressCountry: 'GB' }
      }
      return block
    })

    return [list, ...perAlert]
  }, [JSON.stringify(alerts)])

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
      { name: 'twitter:image', content: ogImage }
    ],
    jsonLd: jsonBlocks
  })
  // ----------------- end AIO / SEO layer -------------

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-charcoal">Alerts</h2>

      {/* create form */}
      <div className="grid gap-4">
        <label htmlFor={idCat} className="block text-sm font-medium text-gray-700">Category
          <select id={idCat} value={cat} onChange={e=>setCat(e.target.value as any)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-sea focus:border-sea sm:text-sm">
            <option value="general">general</option>
            <option value="transport">transport</option>
            <option value="closure">closure</option>
            <option value="lost_found">lost_found</option>
            <option value="weather">weather</option>
          </select>
        </label>
        
        <label htmlFor={idTitle} className="block text-sm font-medium text-gray-700">Alert title
          <input id={idTitle} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Road closed on High St" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-sea focus:border-sea sm:text-sm" />
        </label>

        <label htmlFor={idBody} className="block text-sm font-medium text-gray-700">Alert body
          <textarea id={idBody} value={body} onChange={e=>setBody(e.target.value)} placeholder="Details (optional)" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-sea focus:border-sea sm:text-sm" />
        </label>

        <label htmlFor={idExpires} className="block text-sm font-medium text-gray-700">Expires at
          <input id={idExpires} type="datetime-local" value={exp} onChange={e=>setExp(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-sea focus:border-sea sm:text-sm" />
        </label>

        <button type="button" disabled={!me || creating} onClick={createAlert} aria-busy={creating} className="w-full sm:w-auto px-6 py-2 bg-sea text-white font-semibold rounded-md shadow-sm hover:bg-opacity-90 disabled:bg-gray-400 disabled:cursor-not-allowed">
          {creating ? 'Creating…' : 'Create alert'}
        </button>
      </div>

      <ul className="list-none p-0 flex flex-col gap-4">
        {alerts.map(a => {
          const p = a.author_id ? profiles[a.author_id] : undefined
          const alt = p?.username ? `${p.username}'s avatar` : 'Author avatar'
          const mine = me && a.author_id === me
          const canDelete = !!mine || isMod
          return (
            <li id={`alert-${a.id}`} key={a.id} className="p-4 border border-sea/20 rounded-lg">
              <div className="flex items-center gap-3">
                <img
                  src={p?.avatar_url || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}
                  alt={alt}
                  className="w-8 h-8 rounded-full object-cover bg-gray-200"
                />
                <div>
                  <div className="font-semibold text-charcoal">[{a.category}] {a.title} {a.priority === 1 && <span className="text-sm text-amber-600">• HIGH</span>}</div>
                  <div className="text-xs text-gray-500">
                    {p?.username ? `@${p.username}` : '—'} · {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {a.body && <div className="mt-2 whitespace-pre-wrap">{a.body}</div>}
              <div className="text-xs text-gray-500 mt-2">
                {a.expires_at ? `expires ${new Date(a.expires_at).toLocaleString()}` : 'no expiry'}
              </div>

              <div className="mt-3 flex gap-4">
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => { if (confirm('Delete this alert?')) deleteAlert(a.id) }}
                    aria-label={`Delete alert ${a.title}`}
                    className="text-sm text-lighthouse hover:underline"
                  >
                    Delete
                  </button>
                )}
                {isMod && (
                  <button type="button" onClick={() => togglePriority(a)} aria-pressed={a.priority === 1} className="text-sm text-sea hover:underline">
                    {a.priority === 1 ? 'Unmark High Priority' : 'Mark High Priority'}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      
      {err && <div className="text-lighthouse" aria-live="polite">{err}</div>}
    </div>
  )
}
