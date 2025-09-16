// src/components/admin/PagesAdmin.tsx
import { useEffect, useId, useMemo, useState } from 'react'
import { supabase } from './../lib/supabaseClient'

/** ---------- Types aligned to your app.pages schema ---------- */
type RefItem = { title: string; url: string }
type ImageItem = { id?: number | null; url: string; alt?: string; credit?: string; license?: string }

type PageRow = {
  id?: string
  slug: string
  title: string
  summary: string | null
  body_mdx: string | null
  meta_title: string | null
  meta_description: string | null
  og_image_url: string | null
  status: 'draft' | 'published' | 'archived'
  entities: string[] | null
  refs: RefItem[] | null
  images: ImageItem[] | null
  paragraph_images?: Record<string, ImageItem[]> | null
  updated_at?: string
}

/** ---------- Helpers ---------- */
function ensureHttp(u?: string | null) {
  if (!u) return null
  const url = u.trim()
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('//')) return 'https:' + url
  return `https://${url}`
}

function normalizeRefsFromAny(raw: unknown): RefItem[] {
  if (!raw) return []
  try {
    if (Array.isArray(raw) && raw.length && typeof raw[0] === 'object') {
      return (raw as any[]).map(r => ({
        title: (r?.title ?? r?.url ?? '').toString(),
        url: (r?.url ?? '').toString(),
      })).filter(r => r.url)
    }
    if (Array.isArray(raw) && raw.length && typeof raw[0] === 'string') {
      return (raw as string[]).map(s => {
        const str = String(s)
        const i = str.indexOf('|')
        const title = i > 0 ? str.slice(0, i).trim() : str.trim()
        const url   = i > 0 ? str.slice(i + 1).trim() : str.trim()
        return { title: title || url, url }
      }).filter(r => r.url)
    }
  } catch {}
  return []
}

function sanitizeRefs(refs: RefItem[]): RefItem[] {
  return (refs || [])
    .map(r => ({ title: (r.title || '').trim(), url: (r.url || '').trim() }))
    .filter(r => r.url && /^https?:\/\//i.test(r.url))
}

function normalizeImages(raw: unknown): ImageItem[] {
  if (!raw) return []
  try {
    if (Array.isArray(raw)) {
      return (raw as any[]).map(o => ({
        id: typeof o?.id === 'number' ? o.id : undefined,
        url: (o?.url ?? '').toString(),
        alt: o?.alt ? String(o.alt) : undefined,
        credit: o?.credit ? String(o.credit) : undefined,
        license: o?.license ? String(o.license) : undefined,
      })).filter(x => x.url)
    }
  } catch {}
  return []
}

// Keep ids stable and expose a 1-based num for UI
function reindexImages(imgs: ImageItem[]): ImageItem[] {
  return (imgs || []).map((im, idx) => ({
    ...im,
    id: typeof im.id === 'number' ? im.id : (idx + 1),
    // num is just for UI; TS ignore to avoid type noise
    // @ts-ignore
    num: idx + 1,
  }))
}

// Preserve id, sanitize URL/text
function sanitizeImages(images: ImageItem[]): ImageItem[] {
  return (images || [])
    .map((img, i) => ({
      id: typeof img.id === 'number' ? img.id : (i + 1),
      url: ensureHttp(img.url) ?? '',
      alt: img.alt?.trim() || undefined,
      credit: img.credit?.trim() || undefined,
      license: img.license?.trim() || undefined,
    }))
    .filter(i => !!i.url)
}

function toCommaList(a?: string[] | null) {
  return (a || []).join(', ')
}
function fromCommaList(s: string): string[] | null {
  const arr = s.split(',').map(x => x.trim()).filter(Boolean)
  return arr.length ? arr : null
}

/** ---------- Component ---------- */
export default function PagesAdmin() {
  const [list, setList] = useState<Pick<PageRow, 'slug' | 'title' | 'status'>[]>([])
  const [selSlug, setSelSlug] = useState<string>('')
  const [draft, setDraft] = useState<PageRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // image adders
  const [imgUrl, setImgUrl] = useState('')
  const [imgFile, setImgFile] = useState<File | null>(null)

  const idSlug = useId()
  const idTitle = useId()
  const idSummary = useId()
  const idBody = useId()
  const idMetaTitle = useId()
  const idMetaDesc = useId()
  const idOg = useId()
  const idEntities = useId()
  const idStatus = useId()

  useEffect(() => {
    (async () => {
      try {
        setErr('')
        const { data, error } = await supabase
          .from('pages')
          .select('slug,title,status')
          .order('slug', { ascending: true })
        if (error) throw error
        setList((data || []) as any)
        if (!selSlug && data && data.length) setSelSlug(data[0].slug)
      } catch (e: any) {
        setErr(e?.message ?? String(e))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadOne(slug: string) {
    try {
      setLoading(true); setErr('')
      const { data, error } = await supabase
        .from('pages')
        .select('*')
        .eq('slug', slug)
        .single()
      if (error) throw error
      const row = data as any
      const normalized: PageRow = {
        slug: row.slug,
        title: row.title ?? '',
        summary: row.summary ?? '',
        body_mdx: row.body_mdx ?? '',
        meta_title: row.meta_title ?? '',
        meta_description: row.meta_description ?? '',
        og_image_url: row.og_image_url ?? '',
        status: (row.status || 'draft') as PageRow['status'],
        entities: Array.isArray(row.entities) ? row.entities : [],
        refs: normalizeRefsFromAny(row.refs),
        images: reindexImages(normalizeImages(row.images)),
        paragraph_images: row.paragraph_images ?? null,
        updated_at: row.updated_at
      }
      setDraft(normalized)
      setImgUrl(''); setImgFile(null)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
      setDraft(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selSlug) loadOne(selSlug)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selSlug])

  async function uploadImageToBucket(file: File, slug: string) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `pages/${slug}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error: upErr } = await supabase.storage.from('page-images').upload(path, file, {
      cacheControl: '3600',
      upsert: false
    })
    if (upErr) throw upErr
    const { data: pub } = supabase.storage.from('page-images').getPublicUrl(path)
    return pub.publicUrl
  }

  // ------- Refs (sources) -------
  function addRef() {
    setDraft(prev => prev ? { ...prev, refs: [...(prev.refs ?? []), { title: '', url: '' }] } : prev)
  }
  function updateRef(i: number, key: keyof RefItem, value: string) {
    setDraft(prev => {
      if (!prev) return prev
      const refs = [...(prev.refs ?? [])]
      const r = { ...(refs[i] || { title: '', url: '' }) }
      ;(r as any)[key] = value
      refs[i] = r
      return { ...prev, refs }
    })
  }
  function deleteRef(i: number) {
    setDraft(prev => {
      if (!prev) return prev
      const refs = [...(prev.refs ?? [])]
      refs.splice(i, 1)
      return { ...prev, refs }
    })
  }

  // ------- Images -------
  function addImageUrl() {
    const url = ensureHttp(imgUrl)
    if (!url) return
    setDraft(prev => {
      if (!prev) return prev
      const next = [{ url, alt: prev.title }, ...(prev.images ?? [])]
      return { ...prev, images: reindexImages(next) }
    })
    setImgUrl('')
  }

  async function addImageFile() {
    if (!imgFile || !draft) return
    try {
      const publicUrl = await uploadImageToBucket(imgFile, draft.slug)
      setDraft(prev => {
        if (!prev) return prev
        const next = [{ url: publicUrl, alt: prev.title }, ...(prev.images ?? [])]
        return { ...prev, images: reindexImages(next) }
      })
      setImgFile(null)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    }
  }

  function updateImage(i: number, key: keyof ImageItem, value: string) {
    setDraft(prev => {
      if (!prev) return prev
      const imgs = [...(prev.images ?? [])]
      const im = { ...(imgs[i] || { url: '' }) }
      ;(im as any)[key] = value
      imgs[i] = im
      return { ...prev, images: reindexImages(imgs) }
    })
  }

  function deleteImage(i: number) {
    setDraft(prev => {
      if (!prev) return prev
      const imgs = [...(prev.images ?? [])]
      imgs.splice(i, 1)
      return { ...prev, images: reindexImages(imgs) }
    })
  }

  // ------- Save -------
  async function save() {
    if (!draft) return
    try {
      setSaving(true); setErr('')

      const payload: Partial<PageRow> = {
        title: (draft.title || '').trim(),
        summary: (draft.summary || '').trim(),
        body_mdx: draft.body_mdx || '',
        meta_title: (draft.meta_title || '').trim() || null,
        meta_description: (draft.meta_description || '').trim() || null,
        og_image_url: ensureHttp(draft.og_image_url) || null,
        status: draft.status,
        entities: draft.entities && draft.entities.length ? draft.entities : null,
        refs: sanitizeRefs(draft.refs || []),
        images: sanitizeImages(draft.images || []),
        paragraph_images: draft.paragraph_images ?? null
      }

      const { error } = await supabase
        .from('pages')
        .update(payload as any)
        .eq('slug', draft.slug)

      if (error) throw error
      await loadOne(draft.slug)
      alert('Saved ✅')
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  const current = draft
  const lastUpdated = useMemo(() => {
    if (!current?.updated_at) return ''
    try {
      return new Date(current.updated_at).toLocaleString()
    } catch { return String(current.updated_at) }
  }, [current?.updated_at])

  return (
    <div className="max-w-5xl mx-auto my-6 p-4">
      <h2 className="text-3xl font-bold text-charcoal mb-4">Pages Admin</h2>

      {/* Page picker */}
      <div className="flex gap-4 items-center mb-4">
        <label htmlFor={idSlug} className="text-sm font-medium text-gray-700">Select page</label>
        <select id={idSlug} value={selSlug} onChange={e => setSelSlug(e.target.value)} className="block w-full max-w-xs px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm">
          {list.map(p => (
            <option key={p.slug} value={p.slug}>
              {p.slug} {p.status === 'published' ? '· ✅' : p.status === 'draft' ? '· ✏️' : '· 🗃️'}
            </option>
          ))}
        </select>
        {lastUpdated && <span className="ml-auto text-xs text-gray-500">Last updated: {lastUpdated}</span>}
      </div>

      {loading && <div className="text-gray-500">Loading…</div>}

      {current && !loading && (
        <div className="grid gap-6">
          {/* Basics */}
          <fieldset className="border border-gray-200 rounded-lg p-4">
            <legend className="text-base font-semibold text-charcoal px-1">Basics</legend>
            <div className="grid gap-4 mt-2">
              <label htmlFor={idTitle} className="block text-sm font-medium text-gray-700">Title
                <input id={idTitle} value={current.title} onChange={e => setDraft({ ...current, title: e.target.value })} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" />
              </label>
              <label htmlFor={idSummary} className="block text-sm font-medium text-gray-700">Summary (meta description fallback)
                <textarea id={idSummary} rows={2} value={current.summary ?? ''} onChange={e => setDraft({ ...current, summary: e.target.value })} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" />
              </label>
              <label htmlFor={idBody} className="block text-sm font-medium text-gray-700">Body (MDX)
              <textarea
                id={idBody}
                rows={14}
                value={current.body_mdx ?? ''}
                onChange={e => setDraft({ ...current, body_mdx: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm font-mono text-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500"
              />
                <div className="text-xs text-gray-500 mt-1">
                  Tip: Place images inline via <code>{'<Img i={1} />'}</code> or galleries via <code>{'<Gallery i={[2,3]} />'}</code>.
                </div>
              </label>
            </div>
          </fieldset>

          {/* SEO */}
          <fieldset className="border border-gray-200 rounded-lg p-4">
            <legend className="text-base font-semibold text-charcoal px-1">SEO</legend>
            <div className="grid gap-4 mt-2">
              <label htmlFor={idMetaTitle} className="block text-sm font-medium text-gray-700">Meta title (optional)
                <input id={idMetaTitle} value={current.meta_title ?? ''} onChange={e => setDraft({ ...current, meta_title: e.target.value })} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" />
              </label>
              <label htmlFor={idMetaDesc} className="block text-sm font-medium text-gray-700">Meta description (optional)
                <textarea id={idMetaDesc} rows={2} value={current.meta_description ?? ''} onChange={e => setDraft({ ...current, meta_description: e.target.value })} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" />
              </label>
              <label htmlFor={idOg} className="block text-sm font-medium text-gray-700">OG image URL (optional)
                <input id={idOg} value={current.og_image_url ?? ''} onChange={e => setDraft({ ...current, og_image_url: e.target.value })} placeholder="https://…" className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" />
              </label>
              <label htmlFor={idStatus} className="block text-sm font-medium text-gray-700">Status
                <select id={idStatus} value={current.status} onChange={e => setDraft({ ...current, status: e.target.value as PageRow['status'] })} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm">
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="archived">archived</option>
                </select>
              </label>
              <label htmlFor={idEntities} className="block text-sm font-medium text-gray-700">Entities (comma separated)
                <input
                  id={idEntities}
                  value={toCommaList(current.entities)}
                  onChange={e => setDraft({ ...current, entities: fromCommaList(e.target.value) })}
                  placeholder="Burry Port, Harbour, Lighthouse, ..."
                  className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                />
              </label>
            </div>
          </fieldset>

          {/* Sources */}
          <fieldset className="border border-gray-200 rounded-lg p-4">
            <legend className="text-base font-semibold text-charcoal px-1">Sources (refs)</legend>
            <div className="grid gap-4 mt-2">
              {(current.refs ?? []).map((r, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center">
                  <input placeholder="Title" value={r.title} onChange={e => updateRef(i, 'title', e.target.value)} className="block w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500" />
                  <input placeholder="https://…" value={r.url} onChange={e => updateRef(i, 'url', e.target.value)} className="block w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500" />
                  <button type="button" onClick={() => deleteRef(i)} className="px-3 py-2 text-sm bg-gray-200 text-charcoal rounded-md hover:bg-gray-300">Remove</button>
                </div>
              ))}
              <div>
                <button type="button" onClick={addRef} className="px-3 py-1 text-sm bg-sand text-charcoal rounded-md hover:bg-opacity-80">Add source</button>
              </div>
            </div>
          </fieldset>

          {/* Images */}
          <fieldset className="border border-gray-200 rounded-lg p-4">
            <legend className="text-base font-semibold text-charcoal px-1">Images</legend>
            <div className="grid gap-6 mt-2">
              {/* current images */}
              <div className="flex gap-4 flex-wrap">
                {(current.images ?? []).map((im, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-3 relative w-full max-w-xs">
                    <span className="absolute top-2 left-2 bg-charcoal text-white text-xs font-mono leading-4 h-5 w-5 flex items-center justify-center rounded-full">
                      #{(im as any).num || im.id || (i + 1)}
                    </span>
                    <img src={im.url} alt={im.alt || 'image'} className="w-full h-32 object-cover block rounded-md bg-gray-100" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                    <div className="grid gap-2 mt-2">
                      <input value={im.url} onChange={e => updateImage(i, 'url', e.target.value)} className="block w-full px-2 py-1 text-xs bg-white border border-gray-300 rounded-md shadow-sm" />
                      <input placeholder="alt text" value={im.alt ?? ''} onChange={e => updateImage(i, 'alt', e.target.value)} className="block w-full px-2 py-1 text-xs bg-white border border-gray-300 rounded-md shadow-sm" />
                      <input placeholder="credit (optional)" value={im.credit ?? ''} onChange={e => updateImage(i, 'credit', e.target.value)} className="block w-full px-2 py-1 text-xs bg-white border border-gray-300 rounded-md shadow-sm" />
                      <input placeholder="license (optional)" value={im.license ?? ''} onChange={e => updateImage(i, 'license', e.target.value)} className="block w-full px-2 py-1 text-xs bg-white border border-gray-300 rounded-md shadow-sm" />
                      <button type="button" onClick={() => deleteImage(i)} className="w-full px-2 py-1 text-xs bg-gray-200 text-charcoal rounded-md hover:bg-gray-300">Remove</button>
                    </div>
                  </div>
                ))}
                {(current.images ?? []).length === 0 && (
                  <div className="text-sm text-gray-500">No images yet.</div>
                )}
              </div>

              {/* add via URL */}
              <div className="flex gap-2 items-center border-t border-gray-200 pt-4">
                <input placeholder="Paste image URL" value={imgUrl} onChange={e => setImgUrl(e.target.value)} className="flex-1 block w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500" />
                <button type="button" onClick={addImageUrl} className="px-3 py-2 text-sm bg-gray-200 text-charcoal rounded-md hover:bg-gray-300">Add URL</button>
              </div>

              {/* add via upload */}
              <div className="flex gap-2 items-center">
                <input type="file" accept="image/*" onChange={e => setImgFile(e.target.files?.[0] ?? null)} className="flex-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sand file:text-charcoal hover:file:bg-opacity-80" />
                <button type="button" disabled={!imgFile} onClick={addImageFile} className="px-3 py-2 text-sm bg-gray-200 text-charcoal rounded-md hover:bg-gray-300 disabled:opacity-50">Upload & Add</button>
                {imgFile && <span className="text-xs text-gray-500">{imgFile.name}</span>}
              </div>
            </div>
          </fieldset>

          {/* Save */}
          <div className="flex gap-4">
            <button type="button" onClick={save} disabled={saving} aria-busy={saving} className="px-6 py-2 bg-charcoal text-white font-semibold rounded-md shadow-sm hover:bg-opacity-90 disabled:bg-gray-400">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" onClick={() => selSlug && loadOne(selSlug)} className="px-4 py-2 bg-gray-200 text-charcoal rounded-md hover:bg-gray-300">Reload</button>
          </div>
        </div>
      )}

      {err && <div className="text-coral mt-4" aria-live="polite">{err}</div>}
    </div>
  )
}
