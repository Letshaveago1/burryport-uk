import { useEffect, useMemo, useState, ChangeEvent } from 'react'
import { supabase } from '../lib/supabaseClient'



type ImageObj = { url: string; alt?: string }
type Biz = {
  id: number
  name: string
  category: string | null
  address: string | null
  website: string | null
  phone: string | null
  email?: string | null
  description?: string | null
  facebook_page?: string | null
  opening_hours?: string | null
  tags?: string[] | null
  images: ImageObj[] | null
  owner_id: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at?: string
}

type Claim = {
  id: number
  business_id: number
  claimant_id: string
  message: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

type Profile = { user_id: string; username: string | null; avatar_url: string | null }

function ensureHttp(u?: string | null) {
  if (!u) return null
  if (/^https?:\/\//i.test(u)) return u
  return `https://${u}`
}
function pick<T extends object>(obj: T, keys: string[]) {
  const out: Record<string, any> = {}
  for (const k of keys) if (k in (obj as any)) out[k] = (obj as any)[k]
  return out
}
function uniq<T>(arr: T[]) { return Array.from(new Set(arr)) }

const EDITABLE_FIELDS = [
  'name','category','address','website','phone','email','description',
  'facebook_page','opening_hours','tags','status','owner_id'
] as const
type EditableKey = typeof EDITABLE_FIELDS[number]

export default function Admin(){
  const [tab, setTab] = useState<'biz' | 'claims' | 'add' | 'all'>('biz')
  const [pendingBiz, setPendingBiz] = useState<Biz[]>([])
  const [claims, setClaims] = useState<Claim[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [bizMap, setBizMap] = useState<Record<number, Biz>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // All tab state
  const [all, setAll] = useState<Biz[]>([])
  const [allQ, setAllQ] = useState('')
  const [allStatus, setAllStatus] = useState<'all'|'approved'|'pending'|'rejected'>('all')

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<Partial<Biz> | null>(null)
  const [editImages, setEditImages] = useState<ImageObj[]>([])
  const [editImageFile, setEditImageFile] = useState<File | null>(null)
  const [editImageUrl, setEditImageUrl] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editLoading, setEditLoading] = useState(false)

  // Create state
  const [createSaving, setCreateSaving] = useState(false)
  const [createForm, setCreateForm] = useState<Record<string, any>>({
    name:'', category:'', address:'', website:'', phone:'', email:'', description:'',
    facebook_page:'', opening_hours:'', tags:'', status:'pending',
  })
  const [createImageFile, setCreateImageFile] = useState<File | null>(null)
  const [createImageUrl, setCreateImageUrl] = useState('')

  const showErr = (e:any)=> setErr(e?.message ?? String(e))

  // -------- Loads ----------
  async function loadPendingBiz() {
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .in('status', ['pending','rejected'])
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    const rows = (data || []) as Biz[]
    setPendingBiz(rows)
    const map: Record<number, Biz> = {}
    rows.forEach(b => { map[b.id] = b })
    setBizMap(prev => ({ ...prev, ...map }))
  }

  async function loadClaims() {
    const { data, error } = await supabase
      .from('business_claims')
      .select('id,business_id,claimant_id,message,status,created_at')
      .eq('status','pending')
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) throw error
    setClaims((data || []) as Claim[])
  }

  async function loadAll() {
    const qb = supabase.from('businesses').select('*').order('name', { ascending: true })
    const { data, error } = await qb
    if (error) throw error
    setAll((data || []) as Biz[])
  }

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([loadPendingBiz(), loadClaims(), loadAll()])
      } catch (e) { showErr(e) }
    })()

    const ch = supabase
      .channel('rt-admin-biz')
      .on('postgres_changes', { event:'*', schema:'app', table:'businesses' }, () => {
        // stay simple: refresh everything affected
        loadPendingBiz().catch(showErr)
        loadAll().catch(showErr)
      })
      .on('postgres_changes', { event:'*', schema:'app', table:'business_claims' }, () => loadClaims().catch(showErr))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // hydrate claimant profiles + businesses referenced by claims
  const claimantIds = useMemo(() => uniq(claims.map(c => c.claimant_id)), [claims])
  const claimBizIds = useMemo(() => uniq(claims.map(c => c.business_id)), [claims])

  useEffect(() => {
    (async () => {
      if (claimantIds.length === 0) { setProfiles({}); return }
      const { data } = await supabase
        .from('profiles')
        .select('user_id,username,avatar_url')
        .in('user_id', claimantIds)
      const map: Record<string, Profile> = {}
      for (const p of (data || []) as Profile[]) map[p.user_id] = p
      setProfiles(map)
    })().catch(showErr)
  }, [claimantIds.join('|')])

  useEffect(() => {
    (async () => {
      const missing = claimBizIds.filter(id => !bizMap[id])
      if (!missing.length) return
      const { data } = await supabase
        .from('businesses')
        .select('*')
        .in('id', missing)
      const map = { ...bizMap }
      for (const b of (data || []) as Biz[]) map[b.id] = b
      setBizMap(map)
    })().catch(showErr)
  }, [claimBizIds.join('|')]) // eslint-disable-line

  // -------- Approve / Reject ----------
  async function setBusinessStatus(id: number, status: Biz['status']) {
    try {
      setBusy(true)
      const { error } = await supabase.from('businesses').update({ status }).eq('id', id)
      if (error) throw error
    } catch (e) { showErr(e) } finally { setBusy(false) }
  }

  async function approveClaim(claim: Claim) {
    try {
      setBusy(true)
      const current = bizMap[claim.business_id]
      const updates: Partial<Biz> = { owner_id: claim.claimant_id }
      if (current?.status !== 'approved') updates.status = 'approved'
      const { error: upBizErr } = await supabase.from('businesses').update(updates).eq('id', claim.business_id)
      if (upBizErr) throw upBizErr
      const { data: auth } = await supabase.auth.getUser()
      const reviewer = auth.user?.id ?? null
      const { error: upClaimErr } = await supabase
        .from('business_claims')
        .update({ status: 'approved', reviewed_by: reviewer, reviewed_at: new Date().toISOString() })
        .eq('id', claim.id)
      if (upClaimErr) throw upClaimErr
    } catch (e) { showErr(e) } finally { setBusy(false) }
  }

  async function rejectClaim(claim: Claim) {
    try {
      setBusy(true)
      const { data: auth } = await supabase.auth.getUser()
      const reviewer = auth.user?.id ?? null
      const { error } = await supabase
        .from('business_claims')
        .update({ status: 'rejected', reviewed_by: reviewer, reviewed_at: new Date().toISOString() })
        .eq('id', claim.id)
      if (error) throw error
    } catch (e) { showErr(e) } finally { setBusy(false) }
  }

  // -------- Edit helpers ----------
  function toImagesArray(raw: any): ImageObj[] {
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    if (typeof raw === 'string') {
      try { const p = JSON.parse(raw); return Array.isArray(p) ? p : [] } catch { return [] }
    }
    return []
  }

  async function openEdit(id: number) {
    try {
      setErr('')
      setEditingId(id)
      setEditLoading(true)
      setEditImageFile(null); setEditImageUrl('')
      const { data, error } = await supabase.from('businesses').select('*').eq('id', id).single()
      if (error) throw error
      const row = data as Biz
      const base: Partial<Biz> = {}
      for (const k of EDITABLE_FIELDS) (base as any)[k] = (row as any)[k] ?? null
      setEditData(base)
      setEditImages(toImagesArray(row.images))
    } catch (e) { showErr(e) } finally { setEditLoading(false) }
  }

  function editFieldChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setEditData(prev => ({ ...(prev || {}), [name]: name === 'tags' ? value : value }))
  }

  function addEditImageUrl() {
    const u = (editImageUrl || '').trim()
    if (!u) return
    const url = ensureHttp(u)
    if (!url) return
    setEditImages(prev => [{ url, alt: (editData?.name || 'image') as string }, ...prev])
    setEditImageUrl('')
  }
  function removeEditImage(i: number) {
    setEditImages(prev => prev.filter((_, idx) => idx !== i))
  }

  async function uploadBizImage(file: File, alt: string) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `admin/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error: upErr } = await supabase.storage.from('business-images').upload(path, file, { cacheControl: '3600', upsert: false })
    if (upErr) throw upErr
    const { data: pub } = supabase.storage.from('business-images').getPublicUrl(path)
    return { url: pub.publicUrl, alt }
  }

  async function saveEdit() {
    if (!editingId || !editData) return
    try {
      setEditSaving(true)

      let images = [...editImages]
      if (editImageFile) {
        const imgObj = await uploadBizImage(editImageFile, (editData.name as string) || 'image')
        images = [imgObj, ...images]
      }

      const website = ensureHttp((editData.website as string) || null)
      const facebook_page = ensureHttp((editData.facebook_page as string) || null)
      let tags: string[] | null = null
      if (typeof editData.tags === 'string') {
        const raw = (editData.tags as unknown as string).split(',').map(s => s.trim()).filter(Boolean)
        tags = raw.length ? raw : null
      } else if (Array.isArray(editData.tags)) {
        tags = (editData.tags as string[]).length ? editData.tags as string[] : null
      }

      const payload = pick(
        {
          ...editData,
          website,
          facebook_page,
          tags,
          images
        },
        [...EDITABLE_FIELDS, 'images']
      )

      const { error } = await supabase.from('businesses').update(payload).eq('id', editingId)
      if (error) throw error

      setEditingId(null); setEditData(null); setEditImages([]); setEditImageFile(null); setEditImageUrl('')
    } catch (e) { showErr(e) } finally { setEditSaving(false) }
  }

  // -------- Create helpers ----------
  function onCreateChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setCreateForm(prev => ({ ...prev, [name]: value }))
  }
  function addCreateImageUrl() {
    const u = (createImageUrl || '').trim()
    if (!u) return
    const url = ensureHttp(u)
    if (!url) return
    setCreateImageUrl(url) // keep visible
  }

  async function createBusiness() {
    try {
      setCreateSaving(true)
      let images: ImageObj[] = []
      if (createImageFile) {
        const img = await uploadBizImage(createImageFile, (createForm.name || 'image'))
        images.push(img)
      }
      if (createImageUrl) {
        images.push({ url: createImageUrl, alt: createForm.name || 'image' })
      }

      const website = ensureHttp(createForm.website) as string | null
      const facebook_page = ensureHttp(createForm.facebook_page) as string | null
      const tags = (createForm.tags as string).split(',').map((s)=>s.trim()).filter(Boolean)

      const insertRow: Partial<Biz> = {
        name: (createForm.name || '').trim(),
        category: createForm.category || null,
        address: createForm.address || null,
        website,
        phone: (createForm.phone || '').trim() || null,
        email: (createForm.email || '').trim() || null,
        description: (createForm.description || '').trim() || null,
        facebook_page,
        opening_hours: (createForm.opening_hours || '').trim() || null,
        tags: tags.length ? tags : null,
        status: (createForm.status || 'pending') as Biz['status'],
        images: images.length ? images : null,
      }

      const { error } = await supabase.from('businesses').insert([insertRow])
      if (error) throw error

      setCreateForm({ name:'', category:'', address:'', website:'', phone:'', email:'', description:'', facebook_page:'', opening_hours:'', tags:'', status:'pending' })
      setCreateImageFile(null)
      setCreateImageUrl('')
      alert('Business added.')
      setTab('biz')
    } catch (e) { showErr(e) } finally { setCreateSaving(false) }
  }

  // -------- Render helpers ----------
  function Card({ b, showModeration }: { b: Biz; showModeration?: boolean }) {
    const cover = Array.isArray(b.images) && b.images[0]?.url
    const site = ensureHttp(b.website)
    return (
      <li key={b.id} style={{ border:'1px solid #e5e7eb', borderRadius:10, overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'160px 1fr', gap:12 }}>
          <div style={{ background:'#f3f4f6' }}>
            {cover ? (
              <img
                src={cover}
                alt={b.images![0].alt ?? `${b.name} cover`}
                style={{ width:'100%', height:120, objectFit:'cover', display:'block' }}
                onError={(e)=>{ (e.currentTarget as HTMLImageElement).style.display='none' }}
              />
            ) : <div style={{ width:'100%', height:120 }} />}
          </div>
          <div style={{ padding:10 }}>
            <div style={{ fontWeight:700 }}>{b.name}</div>
            <div style={{ fontSize:12, opacity:0.75 }}>{b.category || '—'} · <i>{b.status}</i></div>
            {b.address && <div style={{ fontSize:12, opacity:0.85 }}>{b.address}</div>}
            <div style={{ display:'flex', gap:8, marginTop:6 }}>
              {site && <a href={site} target="_blank" rel="noreferrer">Website</a>}
              {b.phone && <a href={`tel:${b.phone.replace(/\s+/g,'')}`}>Call</a>}
            </div>
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              {showModeration && (
                <>
                  <button type="button" disabled={busy} onClick={() => setBusinessStatus(b.id, 'approved')} aria-label={`Approve ${b.name}`}>Approve</button>
                  <button type="button" disabled={busy} onClick={() => setBusinessStatus(b.id, 'rejected')} aria-label={`Reject ${b.name}`}>Reject</button>
                </>
              )}
              <button type="button" onClick={() => openEdit(b.id)} aria-label={`Edit ${b.name}`}>Edit</button>
            </div>
          </div>
        </div>
      </li>
    )
  }

  // -------- Filtered “all” ----------
  const allFiltered = useMemo(() => {
    const q = allQ.trim().toLowerCase()
    return all.filter(b => {
      if (allStatus !== 'all' && b.status !== allStatus) return false
      if (!q) return true
      const hay = `${b.name} ${b.category ?? ''} ${b.address ?? ''} ${b.website ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [all, allQ, allStatus])

  return (
    <div style={{ maxWidth: 1000, margin: '24px auto' }}>
      <h2>Admin</h2>

      <div role="tablist" aria-label="Admin sections" style={{ display:'flex', gap:8, margin:'12px 0' }}>
        <button role="tab" aria-selected={tab==='biz'}    onClick={() => setTab('biz')}    disabled={tab==='biz'}>Review</button>
        <button role="tab" aria-selected={tab==='claims'} onClick={() => setTab('claims')} disabled={tab==='claims'}>Claims</button>
        <button role="tab" aria-selected={tab==='add'}    onClick={() => setTab('add')}    disabled={tab==='add'}>Add new</button>
        <button role="tab" aria-selected={tab==='all'}    onClick={() => setTab('all')}    disabled={tab==='all'}>All</button>
        <button onClick={() => { loadPendingBiz().catch(showErr); loadClaims().catch(showErr); loadAll().catch(showErr) }} style={{ marginLeft:'auto' }}>
          Refresh
        </button>
      </div>

      {/* Review tab (pending/rejected) */}
      {tab === 'biz' && (
        <ul style={{ listStyle:'none', padding:0, display:'grid', gap:12 }}>
          {pendingBiz.map(b => <Card key={b.id} b={b} showModeration />)}
          {pendingBiz.length === 0 && <div>No businesses need review. 🎉</div>}
        </ul>
      )}

      {/* Claims tab */}
      {tab === 'claims' && (
        <ul style={{ listStyle:'none', padding:0, display:'grid', gap:12 }}>
          {claims.map(c => {
            const b = bizMap[c.business_id]
            const p = profiles[c.claimant_id]
            return (
              <li key={c.id} style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:10 }}>
                <div style={{ display:'flex', gap:10 }}>
                  <img
                    src={p?.avatar_url || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}
                    alt={p?.username ? `${p.username}'s avatar` : 'Claimant avatar'}
                    style={{ width:36, height:36, borderRadius:'50%', objectFit:'cover', background:'#eee' }}
                  />
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700 }}>{b ? b.name : `Business #${c.business_id}`}</div>
                    <div style={{ fontSize:12, opacity:0.7 }}>
                      claimant: {p?.username ? `@${p.username}` : c.claimant_id.slice(0,8)} · {new Date(c.created_at).toLocaleString()}
                    </div>
                    {c.message && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{c.message}</div>}
                    <div style={{ display:'flex', gap:8, marginTop:8 }}>
                      <button type="button" disabled={busy} onClick={() => approveClaim(c)}>Approve claim</button>
                      <button type="button" disabled={busy} onClick={() => rejectClaim(c)}>Reject claim</button>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
          {claims.length === 0 && <div>No pending claims. 🌿</div>}
        </ul>
      )}

      {/* Add tab */}
      {tab === 'add' && (
        <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12 }}>
          <div style={{ display:'grid', gap:10, maxWidth:560 }}>
            <label>Name<input name="name" value={createForm.name} onChange={onCreateChange} placeholder="Business name" /></label>
            <label>Category<input name="category" value={createForm.category} onChange={onCreateChange} placeholder="e.g. Cafe, Barber" /></label>
            <label>Address<input name="address" value={createForm.address} onChange={onCreateChange} placeholder="Street, Town, Postcode" /></label>
            <label>Website<input name="website" type="url" value={createForm.website} onChange={onCreateChange} placeholder="https://…" /></label>
            <label>Phone<input name="phone" value={createForm.phone} onChange={onCreateChange} placeholder="+44 …" /></label>
            <label>Email<input name="email" type="email" value={createForm.email} onChange={onCreateChange} placeholder="name@example.com" /></label>
            <label>Facebook<input name="facebook_page" value={createForm.facebook_page} onChange={onCreateChange} placeholder="https://facebook.com/…" /></label>
            <label>Opening hours<textarea name="opening_hours" rows={2} value={createForm.opening_hours} onChange={onCreateChange} placeholder="Mon–Fri 9–5; Sat 10–4" /></label>
            <label>Tags (comma-separated)<input name="tags" value={createForm.tags} onChange={onCreateChange} placeholder="coffee, vegan" /></label>
            <label>Status
              <select name="status" value={createForm.status} onChange={onCreateChange}>
                <option value="pending">pending</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
              </select>
            </label>

            <fieldset style={{ border:'1px dashed #ddd', padding:10 }}>
              <legend>Cover image (optional)</legend>
              <div style={{ display:'grid', gap:8 }}>
                <input type="file" accept="image/*" onChange={e => setCreateImageFile(e.target.files?.[0] ?? null)} />
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <input placeholder="Or paste image URL" value={createImageUrl} onChange={e=>setCreateImageUrl(e.target.value)} />
                  <button type="button" onClick={addCreateImageUrl}>Use URL</button>
                </div>
                {(createImageFile || createImageUrl) && (
                  <div style={{ fontSize:12, opacity:0.7 }}>
                    {createImageFile ? createImageFile.name : createImageUrl}
                  </div>
                )}
              </div>
            </fieldset>

            <div style={{ display:'flex', gap:8, marginTop:6 }}>
              <button type="button" onClick={createBusiness} disabled={createSaving} aria-busy={createSaving}>
                {createSaving ? 'Adding…' : 'Add business'}
              </button>
              <button type="button" onClick={() => {
                setCreateForm({ name:'', category:'', address:'', website:'', phone:'', email:'', description:'', facebook_page:'', opening_hours:'', tags:'', status:'pending' })
                setCreateImageFile(null); setCreateImageUrl('')
              }}>
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All tab */}
      {tab === 'all' && (
        <>
          <div style={{ display:'flex', gap:8, margin:'8px 0' }}>
            <input placeholder="Search name, category, address…" value={allQ} onChange={e=>setAllQ(e.target.value)} />
            <select value={allStatus} onChange={e=>setAllStatus(e.target.value as any)}>
              <option value="all">All statuses</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            
            </select>
          </div>
          <ul style={{ listStyle:'none', padding:0, display:'grid', gap:12 }}>
            {allFiltered.map(b => <Card key={b.id} b={b} />)}
            {allFiltered.length === 0 && <div>No matches.</div>}
          </ul>
        </>
      )}

      {/* Editor panel */}
      {editingId !== null && (
        <div style={{ marginTop:16, border:'1px solid #e5e7eb', borderRadius:10, padding:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <strong>Editing business #{editingId}</strong>
            <button style={{ marginLeft:'auto' }} onClick={() => { setEditingId(null); setEditData(null); setEditImages([]); setEditImageFile(null); setEditImageUrl('') }}>
              Close
            </button>
          </div>

          {editLoading && <div>Loading…</div>}

          {editData && (
            <div style={{ display:'grid', gap:10, maxWidth: 680 }}>
              {EDITABLE_FIELDS.map((k) => (
                <label key={k} style={{ display:'grid', gap:6 }}>
                  <div style={{ fontSize:12, opacity:0.8 }}>{k}</div>
                  {k === 'status' ? (
                    <select name="status" value={(editData.status ?? 'pending') as string} onChange={editFieldChange}>
                      <option value="pending">pending</option>
                      <option value="approved">approved</option>
                      <option value="rejected">rejected</option>
                    </select>
                  ) : k === 'opening_hours' ? (
                    <textarea name="opening_hours" rows={2} value={(editData.opening_hours as string) ?? ''} onChange={editFieldChange} />
                  ) : k === 'description' ? (
                    <textarea name="description" rows={3} value={(editData.description as string) ?? ''} onChange={editFieldChange} />
                  ) : k === 'tags' ? (
                    <input name="tags" value={Array.isArray(editData.tags) ? (editData.tags as string[]).join(', ') : (editData.tags as unknown as string) || ''} onChange={editFieldChange} placeholder="comma, separated, tags" />
                  ) : (
                    <input name={k} value={(editData as any)[k] ?? ''} onChange={editFieldChange} />
                  )}
                </label>
              ))}

              <fieldset style={{ border:'1px dashed #ddd', padding:10 }}>
                <legend>Images</legend>
                <div style={{ display:'grid', gap:8 }}>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {editImages.map((im, i) => (
                      <div key={i} style={{ position:'relative' }}>
                        <img src={im.url} alt={im.alt || 'image'} style={{ width:96, height:64, objectFit:'cover', borderRadius:6 }} />
                        <button type="button" onClick={() => removeEditImage(i)} style={{ position:'absolute', top:2, right:2 }}>✕</button>
                      </div>
                    ))}
                    {editImages.length === 0 && <div style={{ fontSize:12, opacity:0.7 }}>No images</div>}
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <input type="file" accept="image/*" onChange={e => setEditImageFile(e.target.files?.[0] ?? null)} />
                    {editImageFile && <span>{editImageFile.name}</span>}
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <input placeholder="Paste image URL" value={editImageUrl} onChange={e=>setEditImageUrl(e.target.value)} />
                    <button type="button" onClick={addEditImageUrl}>Add URL</button>
                  </div>
                </div>
              </fieldset>

              <div style={{ display:'flex', gap:8 }}>
                <button type="button" onClick={saveEdit} disabled={editSaving} aria-busy={editSaving}>
                  {editSaving ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" onClick={() => { setEditingId(null); setEditData(null); setEditImages([]); setEditImageFile(null); setEditImageUrl('') }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {err && <div style={{ color:'#b00020', marginTop:10 }} aria-live="polite">{err}</div>}
    </div>
  )
}
