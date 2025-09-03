import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type ImageObj = { url: string; alt?: string }
type Biz = {
  id: number
  name: string
  category: string | null
  address: string | null
  website: string | null
  phone: string | null
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

export default function Admin(){
  const [tab, setTab] = useState<'biz' | 'claims'>('biz')
  const [pendingBiz, setPendingBiz] = useState<Biz[]>([])
  const [claims, setClaims] = useState<Claim[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [bizMap, setBizMap] = useState<Record<number, Biz>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const showErr = (e:any)=> setErr(e?.message ?? String(e))

  async function loadPendingBiz() {
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('id,name,category,address,website,phone,images,owner_id,status,created_at')
        .in('status', ['pending','rejected'])
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      const rows = (data || []) as Biz[]
      setPendingBiz(rows)
      const map: Record<number, Biz> = {}
      rows.forEach(b => { map[b.id] = b })
      setBizMap(map)
    } catch (e) { showErr(e) }
  }

  async function loadClaims() {
    try {
      const { data, error } = await supabase
        .from('business_claims')
        .select('id,business_id,claimant_id,message,status,created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(200)
      if (error) throw error
      setClaims((data || []) as Claim[])
    } catch (e) { showErr(e) }
  }

  const claimantIds = useMemo(() => Array.from(new Set(claims.map(c => c.claimant_id))), [claims])
  const claimBizIds = useMemo(() => Array.from(new Set(claims.map(c => c.business_id))), [claims])

  useEffect(() => {
    (async () => {
      await Promise.all([loadPendingBiz(), loadClaims()])
    })()

    const ch1 = supabase
      .channel('rt-biz-admin')
      .on('postgres_changes',{ event:'UPDATE', schema:'app', table:'businesses' }, () => loadPendingBiz())
      .subscribe()
    const ch2 = supabase
      .channel('rt-claims-admin')
      .on('postgres_changes',{ event:'*', schema:'app', table:'business_claims' }, () => loadClaims())
      .subscribe()
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2) }
  }, [])

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
    })()
  }, [claimantIds.join('|')])

  useEffect(() => {
    (async () => {
      const missing = claimBizIds.filter(id => !bizMap[id])
      if (missing.length === 0) return
      const { data } = await supabase
        .from('businesses')
        .select('id,name,category,address,website,phone,images,owner_id,status,created_at')
        .in('id', missing)
      const map = { ...bizMap }
      for (const b of (data || []) as Biz[]) map[b.id] = b
      setBizMap(map)
    })()
  }, [claimBizIds.join('|')]) // eslint-disable-line

  async function setBusinessStatus(id: number, status: Biz['status']) {
    try {
      setBusy(true)
      const { error } = await supabase
        .from('businesses')
        .update({ status })
        .eq('id', id)
      if (error) throw error
      await loadPendingBiz()
    } catch (e) { showErr(e) } finally { setBusy(false) }
  }

  async function approveClaim(claim: Claim) {
    try {
      setBusy(true)
      const current = bizMap[claim.business_id]
      const updates: Partial<Biz> = { owner_id: claim.claimant_id }
      if (current?.status !== 'approved') updates.status = 'approved'

      const { error: upBizErr } = await supabase
        .from('businesses')
        .update(updates)
        .eq('id', claim.business_id)
      if (upBizErr) throw upBizErr

      const { data: auth } = await supabase.auth.getUser()
      const reviewer = auth.user?.id ?? null
      const { error: upClaimErr } = await supabase
        .from('business_claims')
        .update({ status: 'approved', reviewed_by: reviewer, reviewed_at: new Date().toISOString() })
        .eq('id', claim.id)
      if (upClaimErr) throw upClaimErr

      await Promise.all([loadClaims(), loadPendingBiz()])
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
      await loadClaims()
    } catch (e) { showErr(e) } finally { setBusy(false) }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '24px auto' }}>
      <h2>Admin</h2>

      <div role="tablist" aria-label="Admin sections" style={{ display:'flex', gap:8, margin:'12px 0' }}>
        <button
          role="tab"
          aria-selected={tab==='biz'}
          onClick={() => setTab('biz')}
          disabled={tab==='biz'}
        >
          Businesses to review
        </button>
        <button
          role="tab"
          aria-selected={tab==='claims'}
          onClick={() => setTab('claims')}
          disabled={tab==='claims'}
        >
          Pending claims
        </button>
        <button onClick={() => { loadPendingBiz(); loadClaims() }} disabled={busy} style={{ marginLeft:'auto' }}>
          Refresh
        </button>
      </div>

      {tab === 'biz' && (
        <ul style={{ listStyle:'none', padding:0, display:'grid', gap:12 }}>
          {pendingBiz.map(b => {
            const cover = Array.isArray(b.images) && b.images[0]?.url
            const site  = ensureHttp(b.website)
            return (
              <li key={b.id} style={{ border:'1px solid #e5e7eb', borderRadius:10, overflow:'hidden' }}>
                <div style={{ display:'grid', gridTemplateColumns:'160px 1fr', gap:12 }}>
                  <div style={{ background:'#f3f4f6' }}>
                    {cover ? (
                      <img
                        src={cover}
                        alt={b.images![0].alt ?? `${b.name} cover`}
                        style={{ width:'100%', height:120, objectFit:'cover', display:'block' }}
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
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setBusinessStatus(b.id, 'approved')}
                        aria-label={`Approve ${b.name}`}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setBusinessStatus(b.id, 'rejected')}
                        aria-label={`Reject ${b.name}`}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
          {pendingBiz.length === 0 && <div>No businesses need review. 🎉</div>}
        </ul>
      )}

      {tab === 'claims' && (
        <ul style={{ listStyle:'none', padding:0, display:'grid', gap:12 }}>
          {claims.map(c => {
            const b = bizMap[c.business_id]
            const p = profiles[c.claimant_id]
            const alt = p?.username ? `${p.username}'s avatar` : 'Claimant avatar'
            return (
              <li key={c.id} style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:10 }}>
                <div style={{ display:'flex', gap:10 }}>
                  <img
                    src={p?.avatar_url || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}
                    alt={alt}
                    style={{ width:36, height:36, borderRadius:'50%', objectFit:'cover', background:'#eee' }}
                  />
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700 }}>{b ? b.name : `Business #${c.business_id}`}</div>
                    <div style={{ fontSize:12, opacity:0.7 }}>
                      claimant: {p?.username ? `@${p.username}` : c.claimant_id.slice(0,8)} · {new Date(c.created_at).toLocaleString()}
                    </div>
                    {c.message && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{c.message}</div>}
                    <div style={{ display:'flex', gap:8, marginTop:8 }}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => approveClaim(c)}
                        aria-label={`Approve claim for ${b?.name ?? `business #${c.business_id}`}`}
                      >
                        Approve claim
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => rejectClaim(c)}
                        aria-label={`Reject claim for ${b?.name ?? `business #${c.business_id}`}`}
                      >
                        Reject claim
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
          {claims.length === 0 && <div>No pending claims. 🌿</div>}
        </ul>
      )}

      {err && <div style={{ color:'#b00020', marginTop:10 }} aria-live="polite">{err}</div>}
    </div>
  )
}
