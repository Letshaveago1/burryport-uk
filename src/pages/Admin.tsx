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
      <li key={b.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <div className="grid grid-cols-[160px_1fr] gap-4">
          <div className="bg-sand">
            {cover ? (
              <img
                src={cover}
                alt={b.images![0].alt ?? `${b.name} cover`}
                className="w-full h-32 object-cover block"
                onError={(e)=>{ (e.currentTarget as HTMLImageElement).style.display='none' }}
              />
            ) : <div className="w-full h-32" />}
          </div>
          <div className="p-3">
            <div className="font-bold text-charcoal">{b.name}</div>
            <div className="text-sm text-gray-600">{b.category || '—'} · <i className="capitalize">{b.status}</i></div>
            {b.address && <div className="text-xs text-gray-500 mt-1">{b.address}</div>}
            <div className="flex gap-4 mt-2">
              {site && <a href={site} target="_blank" rel="noreferrer" className="text-sm text-teal-700 hover:underline">Website</a>}
              {b.phone && <a href={`tel:${b.phone.replace(/\s+/g,'')}`} className="text-sm text-teal-700 hover:underline">Call</a>}
            </div>
            <div className="flex gap-2 mt-3">
              {showModeration && (
                <>
                  <button type="button" disabled={busy} onClick={() => setBusinessStatus(b.id, 'approved')} aria-label={`Approve ${b.name}`} className="px-3 py-1 text-xs bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:bg-gray-400">Approve</button>
                  <button type="button" disabled={busy} onClick={() => setBusinessStatus(b.id, 'rejected')} aria-label={`Reject ${b.name}`} className="px-3 py-1 text-xs bg-gray-200 text-charcoal rounded-md hover:bg-gray-300 disabled:bg-gray-400">Reject</button>
                </>
              )}
              <button type="button" onClick={() => openEdit(b.id)} aria-label={`Edit ${b.name}`} className="px-3 py-1 text-xs bg-sand text-charcoal rounded-md hover:bg-opacity-80">Edit</button>
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
    <div className="max-w-5xl mx-auto my-6 p-4">
      <h2 className="text-3xl font-bold text-charcoal mb-4">Admin</h2>

      <div role="tablist" aria-label="Admin sections" className="flex items-center gap-2 mb-4 border-b border-gray-200">
        <button role="tab" aria-selected={tab==='biz'} onClick={() => setTab('biz')} className={`px-4 py-2 text-sm font-medium rounded-t-md ${tab === 'biz' ? 'bg-sand text-charcoal border-gray-200 border-t border-x' : 'text-gray-600 hover:bg-gray-100'}`}>Review</button>
        <button role="tab" aria-selected={tab==='claims'} onClick={() => setTab('claims')} className={`px-4 py-2 text-sm font-medium rounded-t-md ${tab === 'claims' ? 'bg-sand text-charcoal border-gray-200 border-t border-x' : 'text-gray-600 hover:bg-gray-100'}`}>Claims</button>
        <button role="tab" aria-selected={tab==='add'} onClick={() => setTab('add')} className={`px-4 py-2 text-sm font-medium rounded-t-md ${tab === 'add' ? 'bg-sand text-charcoal border-gray-200 border-t border-x' : 'text-gray-600 hover:bg-gray-100'}`}>Add new</button>
        <button role="tab" aria-selected={tab==='all'} onClick={() => setTab('all')} className={`px-4 py-2 text-sm font-medium rounded-t-md ${tab === 'all' ? 'bg-sand text-charcoal border-gray-200 border-t border-x' : 'text-gray-600 hover:bg-gray-100'}`}>All</button>
        <button onClick={() => { loadPendingBiz().catch(showErr); loadClaims().catch(showErr); loadAll().catch(showErr) }} className="ml-auto text-sm text-teal-700 hover:underline">
          Refresh
        </button>
      </div>

      {/* Review tab (pending/rejected) */}
      {tab === 'biz' && (
        <ul className="list-none p-0 grid gap-4">
          {pendingBiz.map(b => <Card key={b.id} b={b} showModeration />)}
          {pendingBiz.length === 0 && <div className="text-gray-500">No businesses need review. 🎉</div>}
        </ul>
      )}

      {/* Claims tab */}
      {tab === 'claims' && (
        <ul className="list-none p-0 grid gap-4">
          {claims.map(c => {
            const b = bizMap[c.business_id]
            const p = profiles[c.claimant_id]
            return (
              <li key={c.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex gap-4">
                  <img
                    src={p?.avatar_url || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}
                    alt={p?.username ? `${p.username}'s avatar` : 'Claimant avatar'}
                    className="w-9 h-9 rounded-full object-cover bg-gray-200"
                  />
                  <div className="flex-1">
                    <div className="font-bold text-charcoal">{b ? b.name : `Business #${c.business_id}`}</div>
                    <div className="text-xs text-gray-500">
                      claimant: {p?.username ? `@${p.username}` : c.claimant_id.slice(0,8)} · {new Date(c.created_at).toLocaleString()}
                    </div>
                    {c.message && <div className="mt-2 whitespace-pre-wrap text-sm">{c.message}</div>}
                    <div className="flex gap-4 mt-3">
                      <button type="button" disabled={busy} onClick={() => approveClaim(c)} className="px-3 py-1 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:bg-gray-400">Approve claim</button>
                      <button type="button" disabled={busy} onClick={() => rejectClaim(c)} className="px-3 py-1 text-sm bg-gray-200 text-charcoal rounded-md hover:bg-gray-300 disabled:bg-gray-400">Reject claim</button>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
          {claims.length === 0 && <div className="text-gray-500">No pending claims. 🌿</div>}
        </ul>
      )}

      {/* Add tab */}
      {tab === 'add' && (
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="grid gap-4 max-w-xl">
            <label className="block text-sm font-medium text-gray-700">Name<input name="name" value={createForm.name} onChange={onCreateChange} placeholder="Business name" className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" /></label>
            <label className="block text-sm font-medium text-gray-700">Category<input name="category" value={createForm.category} onChange={onCreateChange} placeholder="e.g. Cafe, Barber" className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" /></label>
            <label className="block text-sm font-medium text-gray-700">Address<input name="address" value={createForm.address} onChange={onCreateChange} placeholder="Street, Town, Postcode" className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" /></label>
            <label className="block text-sm font-medium text-gray-700">Website<input name="website" type="url" value={createForm.website} onChange={onCreateChange} placeholder="https://…" className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" /></label>
            <label className="block text-sm font-medium text-gray-700">Phone<input name="phone" value={createForm.phone} onChange={onCreateChange} placeholder="+44 …" className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" /></label>
            <label className="block text-sm font-medium text-gray-700">Email<input name="email" type="email" value={createForm.email} onChange={onCreateChange} placeholder="name@example.com" className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" /></label>
            <label className="block text-sm font-medium text-gray-700">Facebook<input name="facebook_page" value={createForm.facebook_page} onChange={onCreateChange} placeholder="https://facebook.com/…" className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" /></label>
            <label className="block text-sm font-medium text-gray-700">Opening hours<textarea name="opening_hours" rows={2} value={createForm.opening_hours} onChange={onCreateChange} placeholder="Mon–Fri 9–5; Sat 10–4" className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" /></label>
            <label className="block text-sm font-medium text-gray-700">Tags (comma-separated)<input name="tags" value={createForm.tags} onChange={onCreateChange} placeholder="coffee, vegan" className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" /></label>
            <label className="block text-sm font-medium text-gray-700">Status
              <select name="status" value={createForm.status} onChange={onCreateChange} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm">
                <option value="pending">pending</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
              </select>
            </label>

            <fieldset className="border border-dashed border-gray-300 p-4 rounded-md">
              <legend className="text-sm font-medium text-gray-700 px-1">Cover image (optional)</legend>
              <div className="grid gap-4">
                <input type="file" accept="image/*" onChange={e => setCreateImageFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sand file:text-charcoal hover:file:bg-opacity-80" />
                <div className="flex gap-2 items-center">
                  <input placeholder="Or paste image URL" value={createImageUrl} onChange={e=>setCreateImageUrl(e.target.value)} className="flex-1 block w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500" />
                  <button type="button" onClick={addCreateImageUrl} className="px-3 py-2 text-sm bg-gray-200 text-charcoal rounded-md hover:bg-gray-300">Use URL</button>
                </div>
                {(createImageFile || createImageUrl) && (
                  <div className="text-xs text-gray-500">
                    {createImageFile ? createImageFile.name : createImageUrl}
                  </div>
                )}
              </div>
            </fieldset>

            <div className="flex gap-4 mt-2">
              <button type="button" onClick={createBusiness} disabled={createSaving} aria-busy={createSaving} className="px-4 py-2 bg-charcoal text-white font-semibold rounded-md shadow-sm hover:bg-opacity-90 disabled:bg-gray-400">
                {createSaving ? 'Adding…' : 'Add business'}
              </button>
              <button type="button" className="px-4 py-2 bg-gray-200 text-charcoal rounded-md hover:bg-gray-300" onClick={() => {
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
          <div className="flex gap-4 mb-4">
            <input placeholder="Search name, category, address…" value={allQ} onChange={e=>setAllQ(e.target.value)} className="flex-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" />
            <select value={allStatus} onChange={e=>setAllStatus(e.target.value as any)} className="block w-full max-w-xs px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm">
              <option value="all">All statuses</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            
            </select>
          </div>
          <ul className="list-none p-0 grid gap-4">
            {allFiltered.map(b => <Card key={b.id} b={b} />)}
            {allFiltered.length === 0 && <div className="text-gray-500">No matches.</div>}
          </ul>
        </>
      )}

      {/* Editor panel */}
      {editingId !== null && (
        <div className="mt-6 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-4 mb-4">
            <strong className="text-lg font-semibold text-charcoal">Editing business #{editingId}</strong>
            <button className="ml-auto text-sm text-gray-600 hover:underline" onClick={() => { setEditingId(null); setEditData(null); setEditImages([]); setEditImageFile(null); setEditImageUrl('') }}>
              Close
            </button>
          </div>

          {editLoading && <div className="text-gray-500">Loading…</div>}

          {editData && (
            <div className="grid gap-4 max-w-2xl">
              {EDITABLE_FIELDS.map((k) => (
                <label key={k} className="block text-sm font-medium text-gray-700">
                  <span className="capitalize">{k.replace('_', ' ')}</span>
                  {k === 'status' ? (
                    <select name="status" value={(editData.status ?? 'pending') as string} onChange={editFieldChange} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm">
                      <option value="pending">pending</option>
                      <option value="approved">approved</option>
                      <option value="rejected">rejected</option>
                    </select>
                  ) : k === 'opening_hours' ? (
                    <textarea name="opening_hours" rows={2} value={(editData.opening_hours as string) ?? ''} onChange={editFieldChange} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" />
                  ) : k === 'description' ? (
                    <textarea name="description" rows={3} value={(editData.description as string) ?? ''} onChange={editFieldChange} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" />
                  ) : k === 'tags' ? (
                    <input name="tags" value={Array.isArray(editData.tags) ? (editData.tags as string[]).join(', ') : (editData.tags as unknown as string) || ''} onChange={editFieldChange} placeholder="comma, separated, tags" className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" />
                  ) : (
                    <input name={k} value={(editData as any)[k] ?? ''} onChange={editFieldChange} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm" />
                  )}
                </label>
              ))}

              <fieldset className="border border-dashed border-gray-300 p-4 rounded-md">
                <legend className="text-sm font-medium text-gray-700 px-1">Images</legend>
                <div className="grid gap-4">
                  <div className="flex gap-2 flex-wrap">
                    {editImages.map((im, i) => (
                      <div key={i} className="relative">
                        <img src={im.url} alt={im.alt || 'image'} className="w-24 h-16 object-cover rounded-md" />
                        <button type="button" onClick={() => removeEditImage(i)} className="absolute top-1 right-1 w-5 h-5 bg-black bg-opacity-50 text-white text-xs rounded-full flex items-center justify-center hover:bg-opacity-75">✕</button>
                      </div>
                    ))}
                    {editImages.length === 0 && <div className="text-xs text-gray-500">No images</div>}
                  </div>
                  <div className="flex gap-2 items-center">
                    <input type="file" accept="image/*" onChange={e => setEditImageFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sand file:text-charcoal hover:file:bg-opacity-80" />
                    {editImageFile && <span className="text-xs text-gray-500">{editImageFile.name}</span>}
                  </div>
                  <div className="flex gap-2 items-center">
                    <input placeholder="Paste image URL" value={editImageUrl} onChange={e=>setEditImageUrl(e.target.value)} className="flex-1 block w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500" />
                    <button type="button" onClick={addEditImageUrl} className="px-3 py-2 text-sm bg-gray-200 text-charcoal rounded-md hover:bg-gray-300">Add URL</button>
                  </div>
                </div>
              </fieldset>

              <div className="flex gap-4">
                <button type="button" onClick={saveEdit} disabled={editSaving} aria-busy={editSaving} className="px-4 py-2 bg-charcoal text-white font-semibold rounded-md shadow-sm hover:bg-opacity-90 disabled:bg-gray-400">
                  {editSaving ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" className="px-4 py-2 bg-gray-200 text-charcoal rounded-md hover:bg-gray-300" onClick={() => { setEditingId(null); setEditData(null); setEditImages([]); setEditImageFile(null); setEditImageUrl('') }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {err && <div className="text-coral mt-4" aria-live="polite">{err}</div>}
    </div>
  )
}
