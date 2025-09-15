// src/pages/StaticPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { compile } from '@mdx-js/mdx'
import * as runtime from 'react/jsx-runtime'
import { useHead } from '../lib/seo'
import { siteBase, placeSchema, touristAttractionSchema, faqSchema, breadcrumbSchema } from '../lib/schema'

const DEFAULT_OG = `${siteBase}/og/default.jpg`

// ------- robust normalizers (handle jsonb objects, text[], odd shapes) -------
function normalizeRefs(raw) {
  if (!raw) return []
  try {
    if (Array.isArray(raw) && raw.length && typeof raw[0] === 'object') {
      return raw
        .map(r => ({ title: r?.title || r?.url || 'Source', url: r?.url || '' }))
        .filter(r => typeof r.url === 'string' && /^https?:\/\//i.test(r.url))
    }
    if (Array.isArray(raw) && raw.length && typeof raw[0] === 'string') {
      return raw
        .map(String)
        .map(s => {
          const i = s.indexOf('|')
          const title = i > 0 ? s.slice(0, i).trim() : s.trim()
          const url   = i > 0 ? s.slice(i + 1).trim() : s.trim()
          return { title: title || url, url }
        })
        .filter(r => typeof r.url === 'string' && /^https?:\/\//i.test(r.url))
    }
    if (typeof raw === 'object' && raw && 'url' in raw) {
      const o = raw
      if (typeof o.url === 'string' && /^https?:\/\//i.test(o.url)) {
        return [{ title: o.title || o.url || 'Source', url: o.url }]
      }
    }
  } catch {}
  return []
}

function normalizeImages(raw) {
  if (!raw) return []
  try {
    if (!Array.isArray(raw)) return []
    return raw
      .filter(x => x && typeof x.url === 'string' && x.url.length > 0)
      .map(x => ({
        id: x.id ?? null, // may be null if not yet backfilled
        url: x.url,
        alt: x.alt || '',
        credit: x.credit || '',
        license: x.license || ''
      }))
  } catch { return [] }
}

export default function StaticPage({ slug }) {
  const [doc, setDoc] = useState(null)
  const [Comp, setComp] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('pages') // client defaults to the 'app' schema
          .select('*')
          .eq('slug', slug)
          .eq('status', 'published')
          .single()

        if (error) throw error
        if (cancelled) return

        // Normalize DB fields so rendering is bulletproof
        const normalized = {
          ...data,
          refs: normalizeRefs(data?.refs),
          images: normalizeImages(data?.images),
          body_mdx: data?.body_mdx || ''
        }

        if (import.meta?.env?.DEV) {
          // eslint-disable-next-line no-console
          console.debug('[StaticPage] normalized', slug, normalized)
        }

        setDoc(normalized)

        const code = String(await compile(normalized.body_mdx, {
          outputFormat: 'function-body'
        }))
        // eslint-disable-next-line no-new-func
        const fn = new Function(code)
        const MDX = fn({ ...runtime }).default
        if (!cancelled) setComp(() => MDX)
      } catch (e) {
        if (!cancelled) setErr(e?.message || 'Failed to load page')
      }
    })()
    return () => { cancelled = true }
  }, [slug])

  const canonical = `${siteBase}/${slug}`
  const title = doc?.meta_title || (doc ? `${doc.title} – BurryPort.uk` : 'BurryPort.uk')
  const description = doc?.meta_description || doc?.summary || ''
  const ogImage = doc?.og_image_url || DEFAULT_OG

  // Schema blocks
  const jsonBlocks = []
  jsonBlocks.push(breadcrumbSchema([
    { name: 'Home', url: siteBase },
    { name: doc?.title || slug, url: canonical },
  ]))
  if (slug === 'harbour') {
    jsonBlocks.push(touristAttractionSchema({ name: 'Burry Port Harbour & Lighthouse', url: canonical, description }))
  } else if (slug === 'earhart') {
    jsonBlocks.push(touristAttractionSchema({ name: 'Amelia Earhart Monument (Burry Port)', url: canonical, description }))
  } else if (slug === 'faq') {
    jsonBlocks.push(faqSchema([
      { q: 'What is Burry Port known for?', a: 'Harbour, lighthouse sunsets, Millennium Coastal Path, Pembrey Country Park, Cefn Sidan beach, and the 1928 Amelia Earhart landing.' },
      { q: 'How do I get there?', a: 'Rail: Pembrey & Burry Port (PBY). Roads via A484/A4138.' },
      { q: 'Where are the best walks?', a: 'Millennium Coastal Path; dunes/forest trails in Pembrey Country Park.' },
    ], canonical))
  } else {
    jsonBlocks.push(placeSchema({ url: canonical, description }))
  }

  useHead({
    title,
    description,
    canonical,
    metas: [
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'article' },
      { property: 'og:image', content: ogImage },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: ogImage }
    ],
    jsonLd: jsonBlocks,
  })

  if (err) return <div className="p-4 text-sm text-red-600">{err}</div>
  if (!doc || !Comp) return <div className="p-4">Loading…</div>

  // ------- helpers for MDX components -------
  // Build lookup by image id (numbered images)
  const imgById = new Map()
  if (Array.isArray(doc.images)) {
    for (const im of doc.images) {
      const id = Number(im?.id)
      if (id && !Number.isNaN(id)) imgById.set(id, im)
    }
  }

  // Inline footnotes, e.g. <Cite n={1}/>
  function Cite({ n }) {
    const idx = Math.max(0, (n || 1) - 1)
    const ref = Array.isArray(doc.refs) ? doc.refs[idx] : null
    if (!ref) return <sup>[{n}]</sup>
    return (
      <sup style={{ marginLeft: 2 }}>
        <a href={ref.url} target="_blank" rel="noopener nofollow ugc">[{n}]</a>
      </sup>
    )
  }

  // Single image by number: <Img n={1}/>
  function Img({ n }) {
    const id = Number(n)
    const im = imgById.get(id)
    if (!im) return null
    return (
      <figure style={{ margin:'12px 0' }}>
        <img
          src={im.url}
          alt={im.alt || doc.title}
          style={{ width:'100%', borderRadius:8, display:'block', background:'#f6f7f8' }}
          loading="lazy"
        />
        {(im.alt || im.credit) && (
          <figcaption style={{ fontSize:12, opacity:0.75, marginTop:6 }}>
            {im.alt || ''}{im.credit ? (im.alt ? ' — ' : '') + im.credit : ''}
          </figcaption>
        )}
      </figure>
    )
  }

  // Simple looping gallery: <Gallery ids={[2,3]} interval={4000}/>
  function Gallery({ ids = [], interval = 3500 }) {
    const [i, setI] = useState(0)
    const imgs = (Array.isArray(ids) ? ids : [])
      .map(Number)
      .map(id => imgById.get(id))
      .filter(Boolean)

    useEffect(() => {
      if (imgs.length <= 1) return
      const t = setInterval(() => setI(prev => (prev + 1) % imgs.length), interval)
      return () => clearInterval(t)
    }, [imgs.length, interval])

    if (imgs.length === 0) return null
    const cur = imgs[Math.min(i, imgs.length - 1)]

    return (
      <figure style={{ margin:'12px 0' }}>
        <div style={{ position:'relative', width:'100%', overflow:'hidden', borderRadius:8 }}>
          <img
            src={cur.url}
            alt={cur.alt || doc.title}
            style={{ width:'100%', display:'block', background:'#f6f7f8' }}
            loading="lazy"
          />
          {imgs.length > 1 && (
            <div style={{
              position:'absolute', bottom:6, right:8, background:'rgba(0,0,0,0.45)',
              color:'#fff', fontSize:12, padding:'2px 6px', borderRadius:6
            }}>
              {i + 1}/{imgs.length}
            </div>
          )}
        </div>
        {(cur.alt || cur.credit) && (
          <figcaption style={{ fontSize:12, opacity:0.75, marginTop:6 }}>
            {cur.alt || ''}{cur.credit ? (cur.alt ? ' — ' : '') + cur.credit : ''}
          </figcaption>
        )}
      </figure>
    )
  }

  const updated =
    doc.updated_at ? new Date(doc.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) : null

  return (
    <main className="mx-auto max-w-screen-sm p-4">
      <h1 className="text-2xl font-semibold mb-1">{doc.title}</h1>
      {updated && <div style={{fontSize:12,opacity:0.7, marginBottom:12}}>Last updated {updated}</div>}

      {/* Optional top gallery of ALL images (can keep or remove) */}
      {Array.isArray(doc.images) && doc.images.length > 0 && (
        <section className="mb-4" style={{ display:'grid', gap:12 }}>
          {doc.images.map((img, i) => (
            <figure key={i} style={{ margin:0 }}>
              <img
                src={img.url}
                alt={img.alt || doc.title}
                style={{ width:'100%', borderRadius:8 }}
                loading="lazy"
              />
              {(img.alt || img.credit) && (
                <figcaption style={{ fontSize:12, opacity:0.75, marginTop:6 }}>
                  {img.alt || ''}{img.credit ? (img.alt ? ' — ' : '') + img.credit : ''}
                </figcaption>
              )}
            </figure>
          ))}
        </section>
      )}

      {/* MDX body; pass Cite/Img/Gallery so editors can place sources & images inline */}
      <article className="prose prose-neutral max-w-none">
        <Comp key={slug} components={{ Cite, Img, Gallery }} />
      </article>

      {/* Guaranteed Sources box (from normalized refs) */}
      {Array.isArray(doc.refs) && doc.refs.length > 0 && (
        <aside style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>Sources</h2>
          <ol style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
            {doc.refs.map((r, i) => (
              <li key={i}>
                <a href={r.url} target="_blank" rel="noopener nofollow ugc">
                  {r.title || r.url}
                </a>
              </li>
            ))}
          </ol>
        </aside>
      )}
    </main>
  )
}
