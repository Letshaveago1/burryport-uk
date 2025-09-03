import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../components/AuthProvider'

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
  status: 'pending' | 'approved' | 'rejected'
}

function ensureHttp(u?: string | null) {
  if (!u) return null
  if (/^https?:\/\//i.test(u)) return u
  return `https://${u}`
}

export default function Businesses(){
  const { ready, session } = useAuth()
  const me = session?.user?.id ?? null

  const [rows, setRows] = useState<Biz[]>([])
  const [myClaims, setMyClaims] = useState<Record<number, Claim>>({})
  const [err, setErr] = useState('')
  const showErr = (e:any)=> setErr(e?.message ?? String(e))

  async function load() {
    try {
      // only approved for the public
      const { data, error } = await supabase
        .from('businesses')
        .select('id,name,category,address,website,phone,images,owner_id,status,created_at')
        .eq('status', 'approved')
        .order('name', { ascending: true })
        .limit(500)
      if (error) throw error
      setRows((data || []) as Biz[])

      // if logged in, fetch my pending claims to disable the button
      if (me) {
        const { data: claims } = await supabase
          .from('business_claims')
          .select('id,business_id,claimant_id,status')
          .eq('claimant_id', me)
          .in('status', ['pending','approved'])
          .limit(500)
        const map: Record<number, Claim> = {}
        for (const c of (claims || []) as Claim[]) map[c.business_id] = c
        setMyClaims(map)
      } else {
        setMyClaims({})
      }
    } catch (e) { showErr(e) }
  }

  useEffect(() => {
    if (!ready) return
    load()
  }, [ready]) // eslint-disable-line

  async function claim(b: Biz) {
    try {
      if (!me) throw new Error('Please sign in to claim')
      if (b.owner_id) throw new Error('Already claimed')
      if (myClaims[b.id]) throw new Error('You already have an active claim for this business')
      const { error } = await supabase
        .from('business_claims')
        .insert([{ business_id: b.id, claimant_id: me, message: null }])
      if (error) throw error
      await load()
      alert('Claim submitted. An admin will review it.')
    } catch (e) { showErr(e) }
  }

  return (
    <div>
      <h2>Businesses</h2>

      <ul style={{ listStyle:'none', padding:0, display:'grid', gap:12 }}>
        {rows.map(b => {
          const cover = Array.isArray(b.images) && b.images[0]?.url
          const site  = ensureHttp(b.website)
          const canClaim = !b.owner_id && !!me && !myClaims[b.id]
          const youOwn = b.owner_id === me
          const yourClaim = myClaims[b.id]

          return (
            <li key={b.id} style={{ border:'1px solid #e5e7eb', borderRadius:10, overflow:'hidden' }}>
              <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:12 }}>
                <div style={{ background:'#f3f4f6' }}>
                  {cover ? (
                    <img src={cover} alt={b.images![0].alt ?? b.name}
                         style={{ width:'100%', height:100, objectFit:'cover', display:'block' }} />
                  ) : <div style={{ width:'100%', height:100 }} />}
                </div>
                <div style={{ padding:10 }}>
                  <div style={{ fontWeight:700 }}>{b.name}</div>
                  <div style={{ fontSize:12, opacity:0.75 }}>{b.category || '—'}</div>
                  {b.address && <div style={{ fontSize:12, opacity:0.85, marginTop:4 }}>{b.address}</div>}
                  <div style={{ display:'flex', gap:8, marginTop:6 }}>
                    {site && <a href={site} target="_blank" rel="noreferrer">Website</a>}
                    {b.phone && <a href={`tel:${b.phone.replace(/\s+/g,'')}`}>Call</a>}
                  </div>

                  <div style={{ marginTop:8 }}>
                    {youOwn && <span style={{ fontSize:12, color:'#059669' }}>You own this business</span>}
                    {!youOwn && yourClaim && yourClaim.status === 'pending' && (
                      <span style={{ fontSize:12, color:'#b45309' }}>Your claim is pending review</span>
                    )}
                    {!youOwn && canClaim && (
                      <button onClick={() => claim(b)}>Claim this business</button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {rows.length === 0 && <div>No approved businesses yet.</div>}
      {err && <div style={{ color:'#b00020', marginTop:10 }}>{err}</div>}
    </div>
  )
}
