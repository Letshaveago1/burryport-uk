// src/pages/RecyclingHub.tsx
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useHead } from '../lib/seo'
import { siteBase } from '../lib/schema'
import StaticPage from '../pages/StaticPage' // path is fine

type HubItem = {
  kind: 'business'|'event'|'alert'|'page'|'listing'
  ref_id: string
  title: string
  meta: string | null
  updated_at: string
  tag_slugs: string[]
  images: { url?: string; alt?: string }[] | null
  website: string | null
  phone: string | null
  starts_at: string | null
}

const CHIP_TAGS = [
  { slug:'bin', label:'Bins' }, { slug:'dropoff', label:'Drop-offs' },
  { slug:'charity', label:'Charities' }, { slug:'food-bank', label:'Food Banks' },
  { slug:'men-shed', label:'Men’s Shed' }, { slug:'repair-cafe', label:'Repair Café' },
  { slug:'maker', label:'Makers' }, { slug:'reuse', label:'Reuse' }, { slug:'free', label:'Free' },
]

function hrefFor(it: HubItem) {
  switch (it.kind) {
    case 'business': return `${siteBase}/businesses`
    case 'event':    return `${siteBase}/events`
    case 'alert':    return `${siteBase}/alerts`
    case 'page':     return `${siteBase}/${it.meta || ''}` // 'meta' is the slug for pages
    case 'listing':  return `${siteBase}/listings`
    default:         return siteBase
  }
}

export default function RecyclingHub() {
  const [items, setItems] = useState<HubItem[]>([])
  const [err, setErr] = useState('')

  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [kindsFilter, setKindsFilter] = useState<string[]>([])

  const tagFilter = useMemo(
    () => (selectedTags.length ? ['recycling', ...selectedTags] : ['recycling']),
    [selectedTags.join('|')]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setErr('')
        const { data, error } = await supabase.rpc('get_recycling_feed', {
          q: null,
          tag_filter: tagFilter,
          only_kinds: kindsFilter.length ? kindsFilter : null,
          limit_n: 200,
          offset_n: 0,
        })
        if (error) throw error
        if (!cancelled) setItems((data || []) as HubItem[])
      } catch (e:any) {
        if (!cancelled) setErr(e.message || String(e))
      }
    })()
    return () => { cancelled = true }
  }, [tagFilter.join('|'), kindsFilter.join('|')])

  // SEO
  const title = 'Recycling & Reuse – Burry Port'
  const desc = 'Local hub for recycling, drop-offs, repair cafés, Men’s Shed, food banks, and reuse in Burry Port.'
  useHead({
    title,
    description: desc,
    canonical: `${siteBase}/recycling`,
    metas: [
      { property:'og:title', content:title },
      { property:'og:description', content:desc },
      { property:'og:type', content:'website' },
    ],
    jsonLd: [{
      '@context':'https://schema.org',
      '@type':'ItemList',
      name: title,
      url: `${siteBase}/recycling`,
      itemListElement: items.slice(0,50).map((it, i) => ({
        '@type':'ListItem', position:i+1, url: hrefFor(it)
      })),
    }]
  })

  const imgOf = (it: HubItem) => {
    const first = Array.isArray(it.images) ? it.images[0] : null
    return first?.url || null
  }

  return (
    <div>
      {/* Static MDX page content (editable in admin) */}
      <StaticPage slug="recycling" />

      {/* Filters */}
      <div style={{display:'flex', gap:12, flexWrap:'wrap', margin:'8px 0'}}>
        {CHIP_TAGS.map(c => {
          const on = selectedTags.includes(c.slug)
          return (
            <button key={c.slug} onClick={() =>
              setSelectedTags(t => t.includes(c.slug) ? t.filter(s => s!==c.slug) : [...t, c.slug])
            } aria-pressed={on}
              style={{padding:'6px 10px', borderRadius:16, border:'1px solid #e5e7eb', background:on?'#e0f2fe':'#fff'}}>
              {c.label}
            </button>
          )
        })}
        {['business','event','alert','page','listing'].map(k => {
          const on = kindsFilter.includes(k)
          return (
            <button key={k} onClick={() =>
              setKindsFilter(kf => kf.includes(k) ? kf.filter(x => x!==k) : [...kf, k])
            } aria-pressed={on}
              style={{padding:'6px 10px', borderRadius:16, border:'1px dashed #e5e7eb', background:on?'#eef':'#fff'}}>
              {k}
            </button>
          )
        })}
      </div>

      {/* Feed */}
      <ul style={{listStyle:'none', padding:0, display:'grid', gap:12}}>
        {items.map(it => (
          <li key={`${it.kind}-${it.ref_id}`} style={{padding:12, border:'1px solid #e5e7eb', borderRadius:8}}>
            <div style={{display:'grid', gridTemplateColumns:'80px 1fr', gap:12, alignItems:'center'}}>
              <div style={{background:'#f3f4f6', width:'100%', aspectRatio:'1/1', borderRadius:6, overflow:'hidden'}}>
                {imgOf(it) ? <img src={imgOf(it)!} alt={it.title} style={{width:'100%', height:'100%', objectFit:'cover'}}/> : null}
              </div>
              <div>
                <div style={{fontSize:12, opacity:0.65, marginBottom:2}}>{it.kind.toUpperCase()}</div>
                <div style={{fontWeight:700}}>{it.title}</div>
                {it.meta && <div style={{fontSize:12, opacity:0.8, marginTop:4}}>{it.meta}</div>}
                <div style={{marginTop:6}}><a href={hrefFor(it)}>View</a></div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {items.length === 0 && !err && <div>No recycling content yet—add the <code>recycling</code> tag to some entries.</div>}
      {err && <div style={{color:'#b00020', marginTop:10}}>{err}</div>}
    </div>
  )
}
