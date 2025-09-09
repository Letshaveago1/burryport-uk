// src/pages/StaticPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { compile } from '@mdx-js/mdx'
import * as runtime from 'react/jsx-runtime'
import { useHead } from '../lib/seo'
import { siteBase, placeSchema, touristAttractionSchema, faqSchema, breadcrumbSchema } from '../lib/schema'

export default function StaticPage({ slug }) {
  const [doc, setDoc] = useState(null)
  const [Comp, setComp] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('pages') // schema default is app
          .select('*')
          .eq('slug', slug)
          .eq('status', 'published')
          .single()

        if (error) throw error
        if (cancelled) return

        setDoc(data)

        const code = String(await compile(data.body_mdx, { outputFormat: 'function-body' }))
        // eslint-disable-next-line no-new-func
        const fn = new Function(code)
        const MDX = fn({ ...runtime }).default
        if (!cancelled) setComp(() => MDX)
      } catch (e) {
        if (!cancelled) setErr(e.message || 'Failed to load page')
      }
    })()
    return () => { cancelled = true }
  }, [slug])

  const title = doc ? `${doc.title} – BurryPort.uk` : 'BurryPort.uk'
  const description = doc?.summary ?? ''
  const canonical = `${siteBase}/${slug}`

  // Choose schema per page
  const jsonBlocks = []
  // Breadcrumbs (Home > Page)
  jsonBlocks.push(breadcrumbSchema([
    { name: 'Home', url: siteBase },
    { name: doc?.title || slug, url: canonical },
  ]))

  if (slug === 'harbour') {
    jsonBlocks.push(
      touristAttractionSchema({
        name: 'Burry Port Harbour & Lighthouse',
        url: canonical,
        description,
      })
    )
  } else if (slug === 'earhart') {
    jsonBlocks.push(
      touristAttractionSchema({
        name: 'Amelia Earhart Monument (Burry Port)',
        url: canonical,
        description,
      })
    )
  } else if (slug === 'faq') {
    jsonBlocks.push(
      faqSchema(
        [
          { q: 'What is Burry Port known for?', a: 'Harbour, lighthouse sunsets, Millennium Coastal Path, Pembrey Country Park, Cefn Sidan beach, and the 1928 Amelia Earhart landing.' },
          { q: 'How do I get there?', a: 'Rail: Pembrey & Burry Port (PBY). Roads via A484/A4138.' },
          { q: 'Where are the best walks?', a: 'Millennium Coastal Path for flat walking/cycling; dunes/forest trails in Pembrey Country Park.' },
        ],
        canonical
      )
    )
  } else {
    // history, tourism, wildlife (defaults to Place)
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
    ],
    jsonLd: jsonBlocks,
  })

  if (err) return <div className="p-4 text-sm text-red-600">{err}</div>
  if (!doc || !Comp) return <div className="p-4">Loading…</div>

  return (
    <main className="mx-auto max-w-screen-sm p-4">
      <h1 className="text-2xl font-semibold mb-4">{doc.title}</h1>
      <article className="prose prose-neutral max-w-none">
        <Comp />
      </article>
    </main>
  )
}
