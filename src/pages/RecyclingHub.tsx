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
    <div className="space-y-6">
      {/* Static MDX page content (editable in admin) */}
      <StaticPage slug="recycling" />

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {CHIP_TAGS.map(c => {
          const on = selectedTags.includes(c.slug)
          return (
            <button key={c.slug} onClick={() =>
              setSelectedTags(t => t.includes(c.slug) ? t.filter(s => s!==c.slug) : [...t, c.slug])
            } aria-pressed={on}
              className={`px-3 py-1 text-sm rounded-full border ${on ? 'bg-sea text-white border-sea' : 'border-sea/30 hover:bg-sea/10'}`}>
              {c.label}
            </button>
          )
        })}
        {['business','event','alert','page','listing'].map(k => {
          const on = kindsFilter.includes(k)
          return (
            <button key={k} onClick={() =>
              setKindsFilter(kf => kf.includes(k) ? kf.filter(x => x!==k) : [...kf, k])
            } aria-pressed={on} className={`px-3 py-1 text-sm rounded-full border border-dashed ${on ? 'bg-pine text-white border-pine' : 'border-pine/30 hover:bg-pine/10'}`}>
              {k}
            </button>
          )
        })}
      </div>

      {/* Feed */}
      <ul className="list-none p-0 grid gap-4">
        {items.map(it => (
          <li key={`${it.kind}-${it.ref_id}`} className="p-4 border border-sea/20 rounded-lg">
            <div className="grid grid-cols-[80px_1fr] gap-4 items-start">
              <div className="bg-gray-100 w-full aspect-square rounded-md overflow-hidden">
                {imgOf(it) ? <img src={imgOf(it)!} alt={it.title} className="w-full h-full object-cover"/> : null}
              </div>
              <div>
                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500 mb-1">{it.kind}</div>
                <div className="font-bold text-charcoal">{it.title}</div>
                {it.meta && <div className="text-sm text-gray-600 mt-1">{it.meta}</div>}
                <div className="mt-2"><a href={hrefFor(it)} className="text-sm text-sea hover:underline">View</a></div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 && !err && <div className="text-gray-500">No recycling content yet—add the <code>recycling</code> tag to some entries.</div>}
      {err && <div className="text-lighthouse mt-4">{err}</div>}
    </div>
  )
}
