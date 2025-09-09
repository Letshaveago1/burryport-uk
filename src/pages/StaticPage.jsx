import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { compile } from '@mdx-js/mdx'
import * as runtime from 'react/jsx-runtime'

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

        setDoc(data)

        const code = String(
          await compile(data.body_mdx, { outputFormat: 'function-body' })
        )
        // eslint-disable-next-line no-new-func
        const fn = new Function(code)
        const MDX = fn({ ...runtime }).default
        if (!cancelled) setComp(() => MDX)
      } catch (e) {
        if (!cancelled) setErr(e.message || 'Failed to load page')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    if (doc?.title) {
      document.title = `${doc.title} – BurryPort.uk`
    }
  }, [doc])

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
