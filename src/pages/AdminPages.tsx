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
    <div style={{ maxWidth: 980, margin: '24px auto', padding: '0 12px' }}>
      <h2>Pages Admin</h2>

      {/* Page picker */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0' }}>
        <label htmlFor={idSlug} style={{ fontSize: 12, opacity: 0.8 }}>Select page</label>
        <select id={idSlug} value={selSlug} onChange={e => setSelSlug(e.target.value)}>
          {list.map(p => (
            <option key={p.slug} value={p.slug}>
              {p.slug} {p.status === 'published' ? '· ✅' : p.status === 'draft' ? '· ✏️' : '· 🗃️'}
            </option>
          ))}
        </select>
        {lastUpdated && <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.7 }}>Last updated: {lastUpdated}</span>}
      </div>

      {loading && <div>Loading…</div>}

      {current && !loading && (
        <div style={{ display: 'grid', gap: 12 }}>
          {/* Basics */}
          <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
            <legend>Basics</legend>
            <label htmlFor={idTitle} style={{ display: 'grid', gap: 6 }}>
              <div>Title</div>
              <input id={idTitle} value={current.title} onChange={e => setDraft({ ...current, title: e.target.value })} />
            </label>
            <label htmlFor={idSummary} style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              <div>Summary (meta description fallback)</div>
              <textarea id={idSummary} rows={2} value={current.summary ?? ''} onChange={e => setDraft({ ...current, summary: e.target.value })} />
            </label>
            <label htmlFor={idBody} style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              <div>Body (MDX)</div>
              <textarea
                id={idBody}
                rows={14}
                value={current.body_mdx ?? ''}
                onChange={e => setDraft({ ...current, body_mdx: e.target.value })}
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
              />
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                Tip: Place images inline via <code>{'<Img i={1} />'}</code> or galleries via <code>{'<Gallery i={[2,3]} />'}</code>.
              </div>
            </label>
          </fieldset>

          {/* SEO */}
          <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
            <legend>SEO</legend>
            <div style={{ display: 'grid', gap: 8 }}>
              <label htmlFor={idMetaTitle} style={{ display: 'grid', gap: 6 }}>
                <div>Meta title (optional)</div>
                <input id={idMetaTitle} value={current.meta_title ?? ''} onChange={e => setDraft({ ...current, meta_title: e.target.value })} />
              </label>
              <label htmlFor={idMetaDesc} style={{ display: 'grid', gap: 6 }}>
                <div>Meta description (optional)</div>
                <textarea id={idMetaDesc} rows={2} value={current.meta_description ?? ''} onChange={e => setDraft({ ...current, meta_description: e.target.value })} />
              </label>
              <label htmlFor={idOg} style={{ display: 'grid', gap: 6 }}>
                <div>OG image URL (optional)</div>
                <input id={idOg} value={current.og_image_url ?? ''} onChange={e => setDraft({ ...current, og_image_url: e.target.value })} placeholder="https://…" />
              </label>
              <div>
                <label htmlFor={idStatus} style={{ fontSize: 12, opacity: 0.8, display: 'block' }}>Status</label>
                <select id={idStatus} value={current.status} onChange={e => setDraft({ ...current, status: e.target.value as PageRow['status'] })}>
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="archived">archived</option>
                </select>
              </div>
              <label htmlFor={idEntities} style={{ display: 'grid', gap: 6 }}>
                <div>Entities (comma separated)</div>
                <input
                  id={idEntities}
                  value={toCommaList(current.entities)}
                  onChange={e => setDraft({ ...current, entities: fromCommaList(e.target.value) })}
                  placeholder="Burry Port, Harbour, Lighthouse, ..."
                />
              </label>
            </div>
          </fieldset>

          {/* Sources */}
          <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
            <legend>Sources (refs)</legend>
            <div style={{ display: 'grid', gap: 8 }}>
              {(current.refs ?? []).map((r, i) => (
                <div key={i} style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr auto', alignItems: 'center' }}>
                  <input
                    placeholder="Title"
                    value={r.title}
                    onChange={e => updateRef(i, 'title', e.target.value)}
                  />
                  <input
                    placeholder="https://…"
                    value={r.url}
                    onChange={e => updateRef(i, 'url', e.target.value)}
                  />
                  <button type="button" onClick={() => deleteRef(i)}>Remove</button>
                </div>
              ))}
              <div>
                <button type="button" onClick={addRef}>Add source</button>
              </div>
            </div>
          </fieldset>

          {/* Images */}
          <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
            <legend>Images</legend>
            <div style={{ display: 'grid', gap: 10 }}>
              {/* current images */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {(current.images ?? []).map((im, i) => (
                  <div key={i} style={{ border: '1px solid #eee', borderRadius: 8, padding: 8, position: 'relative' }}>
                    <span style={{
                      position:'absolute', top:6, left:6,
                      background:'#111', color:'#fff', fontSize:12, lineHeight:'16px',
                      borderRadius:999, padding:'0 6px'
                    }}>
                      #{(im as any).num || im.id || (i + 1)}
                    </span>
                    <img
                      src={im.url}
                      alt={im.alt || 'image'}
                      style={{ width: 180, height: 120, objectFit: 'cover', display: 'block', borderRadius: 6 }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                    <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                      <input value={im.url} onChange={e => updateImage(i, 'url', e.target.value)} />
                      <input placeholder="alt text" value={im.alt ?? ''} onChange={e => updateImage(i, 'alt', e.target.value)} />
                      <input placeholder="credit (optional)" value={im.credit ?? ''} onChange={e => updateImage(i, 'credit', e.target.value)} />
                      <input placeholder="license (optional)" value={im.license ?? ''} onChange={e => updateImage(i, 'license', e.target.value)} />
                      <button type="button" onClick={() => deleteImage(i)}>Remove</button>
                    </div>
                  </div>
                ))}
                {(current.images ?? []).length === 0 && (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>No images yet.</div>
                )}
              </div>

              {/* add via URL */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  placeholder="Paste image URL"
                  value={imgUrl}
                  onChange={e => setImgUrl(e.target.value)}
                />
                <button type="button" onClick={addImageUrl}>Add URL</button>
              </div>

              {/* add via upload */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setImgFile(e.target.files?.[0] ?? null)}
                />
                <button type="button" disabled={!imgFile} onClick={addImageFile}>Upload & Add</button>
                {imgFile && <span style={{ fontSize: 12, opacity: 0.8 }}>{imgFile.name}</span>}
              </div>
            </div>
          </fieldset>

          {/* Save */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={save} disabled={saving} aria-busy={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" onClick={() => selSlug && loadOne(selSlug)}>Reload</button>
          </div>
        </div>
      )}

      {err && <div style={{ color: '#b00020', marginTop: 10 }} aria-live="polite">{err}</div>}
    </div>
  )
}
