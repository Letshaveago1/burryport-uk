// src/pages/StaticPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { compile } from '@mdx-js/mdx'
import * as runtime from 'react/jsx-runtime'
import { useHead } from '../lib/seo'
import { siteBase, placeSchema, touristAttractionSchema, faqSchema, breadcrumbSchema } from '../lib/schema'

const DEFAULT_OG = `${siteBase}/og/default.jpg`

function normalizeRefs(raw) {
  if (!raw) return []
  try {
    if (Array.isArray(raw) && raw.length && typeof raw[0] === 'object') {
      return raw
        .map(r => ({ title: r?.title || r?.url || 'Source', url: r?.url || '' }))
        .filter(r => typeof r.url === 'string' && /^https?:\/\//i.test(r.url))
    }
    if (Array.isArray(raw) && raw.length && typeof raw[0] === 'string') {
      return raw.map(String).map(s => {
        const i = s.indexOf('|')
        const title = i > 0 ? s.slice(0, i).trim() : s.trim()
        const url   = i > 0 ? s.slice(i + 1).trim() : s.trim()
        return { title: title || url, url }
      }).filter(r => typeof r.url === 'string' && /^https?:\/\//i.test(r.url))
    }
    if (typeof raw === 'object' && raw && 'url' in raw && /^https?:\/\//i.test(raw.url)) {
      return [{ title: raw.title || raw.url || 'Source', url: raw.url }]
    }
  } catch {}
  return []
}

function normalizeImages(raw) {
  if (!raw) return []
  try {
    if (!Array.isArray(raw)) return []
    // Give every image a 1-based number (num). Keep any existing id for backwards compat.
    return raw
      .filter(x => x && typeof x.url === 'string' && x.url.length > 0)
      .map((x, idx) => ({
        id: (typeof x.id === 'number' ? x.id : null),
        num: idx + 1,
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
          .from('pages')
          .select('*')
          .eq('slug', slug)
          .eq('status', 'published')
          .single()
        if (error) throw error
        if (cancelled) return

        const normalized = {
          ...data,
          refs: normalizeRefs(data?.refs),
          images: normalizeImages(data?.images),
          body_mdx: data?.body_mdx || ''
        }
        setDoc(normalized)

        const code = String(await compile(normalized.body_mdx, { outputFormat: 'function-body' }))
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

  const jsonBlocks = []
  jsonBlocks.push(breadcrumbSchema([{ name: 'Home', url: siteBase }, { name: doc?.title || slug, url: canonical }]))
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
    title, description, canonical,
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

  // ===== Components usable inside MDX =====

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

  // Helper: resolve by index (i) or legacy id (n)
  function pickImage({ i, n }) {
    if (typeof i === 'number') {
      const idx = Math.max(0, i - 1)
      return doc.images[idx] || null
    }
    if (typeof n === 'number') {
      const found = doc.images.find(im => im.id === n || im.num === n)
      return found || null
    }
    return null
  }

  // <Img i={1}/>  or  <Img n={1}/>
  function Img(props) {
    const im = pickImage(props)
    if (!im) return null
    return (
      <figure style={{ margin: '12px 0' }}>
        <img
          src={im.url}
          alt={im.alt || doc.title}
          style={{ width: '100%', borderRadius: 8, display:'block', background:'#f6f7f8' }}
          loading="lazy"
        />
        {(im.alt || im.credit) && (
          <figcaption style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
            {im.alt || ''}{im.credit ? (im.alt ? ' — ' : '') + im.credit : ''}
          </figcaption>
        )}
      </figure>
    )
  }

  // <Gallery i={[2,3]} /> (also accepts n=[…])
  function Gallery(props) {
    const list = (props.i || props.n || [])
    const nums = Array.isArray(list) ? list : [list]
    const imgs = nums
      .map(v => pickImage({ i: typeof v === 'number' ? v : undefined, n: typeof v === 'number' ? v : undefined }))
      .filter(Boolean)
    if (imgs.length === 0) return null
    return (
      <div style={{ display:'grid', gap:12, gridTemplateColumns:'1fr 1fr' }}>
        {imgs.map((im, k) => (
          <img key={k} src={im.url} alt={im.alt || doc.title} style={{ width:'100%', borderRadius:8 }} loading="lazy" />
        ))}
      </div>
    )
  }

  const updated = doc.updated_at
    ? new Date(doc.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
    : null

  return (
    <div className="p-4 border border-sea/20 rounded-lg">
      <div className="mx-auto max-w-prose">
        <h1 className="text-3xl font-bold text-charcoal mb-1">{doc.title}</h1>
        {updated && <div className="text-xs text-charcoal/70 mb-4">Last updated {updated}</div>}

        <article className="prose prose-neutral max-w-none">
          <Comp key={slug} components={{ Cite, Img, Gallery }} />
        </article>

        {Array.isArray(doc.refs) && doc.refs.length > 0 && (
          <aside className="mt-8 pt-4 border-t border-sea/20">
            <h2 className="text-lg font-semibold text-charcoal mb-2">Sources</h2>
            <ol className="list-decimal list-inside space-y-2">
              {doc.refs.map((r, i) => (
                <li key={i}>
                  <a href={r.url} target="_blank" rel="noopener nofollow ugc" className="text-sm text-sea hover:underline">
                    {r.title || r.url}
                  </a>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>
    </div>
  )
}
