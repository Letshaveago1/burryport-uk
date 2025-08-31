import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type BusinessRow = {
  id: number
  owner_id: string | null
  name: string
  category: string | null
  description: string | null
  address: string | null
  phone: string | null
  website: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export default function Businesses() {
  const [me, setMe] = useState<string | null>(null)
  const [isMod, setIsMod] = useState(false)
  const [err, setErr] = useState('')

  // public + owner + mod views
  const [approved, setApproved] = useState<BusinessRow[]>([])
  const [mine, setMine] = useState<BusinessRow[]>([])
  const [pending, setPending] = useState<BusinessRow[]>([])

  // form
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [creating, setCreating] = useState(false)

  const showErr = (e:any)=> setErr(e?.message ?? String(e))

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser()
      const uid = u.user?.id ?? null
      setMe(uid)

      if (uid) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('is_moderator')
          .eq('user_id', uid)
          .single()
        setIsMod(!!(prof as any)?.is_moderator)
      }

      await Promise.all([loadApproved(), uid ? loadMine(uid) : null, isMod ? loadPending() : null])
    })()

    const ch = supabase
      .channel('businesses-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'app', table: 'businesses' }, (payload) => {
        const row = payload.new as BusinessRow
        setApproved(prev => row.status === 'approved' ? [row, ...prev] : prev)
        setPending(prev => isMod && row.status === 'pending' ? [row, ...prev] : prev)
        setMine(prev => me && row.owner_id === me ? [row, ...prev] : prev)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'app', table: 'businesses' }, (payload) => {
        const row = payload.new as BusinessRow
        setApproved(prev => {
          const others = prev.filter(b => b.id !== row.id)
          return row.status === 'approved' ? [row, ...others] : others
        })
        setPending(prev => {
          const others = prev.filter(b => b.id !== row.id)
          return isMod && row.status === 'pending' ? [row, ...others] : others
        })
        setMine(prev => {
          if (!me || row.owner_id !== me) return prev
          const idx = prev.findIndex(b => b.id === row.id)
          if (idx === -1) return [row, ...prev]
          const next = [...prev]; next[idx] = row; return next
        })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'app', table: 'businesses' }, (payload) => {
        const id = (payload.old as { id:number }).id
        setApproved(prev => prev.filter(b => b.id !== id))
        setPending(prev => prev.filter(b => b.id !== id))
        setMine(prev => prev.filter(b => b.id !== id))
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMod, me])

  async function loadApproved() {
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('id,owner_id,name,category,description,address,phone,website,status,created_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      setApproved(data as BusinessRow[])
    } catch (e) { showErr(e) }
  }

  async function loadMine(uid: string) {
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('id,owner_id,name,category,description,address,phone,website,status,created_at')
        .eq('owner_id', uid)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      setMine(data as BusinessRow[])
    } catch (e) { showErr(e) }
  }

  async function loadPending() {
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('id,owner_id,name,category,description,address,phone,website,status,created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(200)
      if (error) throw error
      setPending(data as BusinessRow[])
    } catch (e) { showErr(e) }
  }

  async function createBusiness() {
    try {
      const { data: meUser } = await supabase.auth.getUser()
      if (!meUser.user) throw new Error('Sign in first')
      if (!name.trim()) throw new Error('Name is required')
      setCreating(true)
      const { error } = await supabase
        .from('businesses')
        .insert([{ owner_id: meUser.user.id, name, category, description, address, phone, website }])
      if (error) throw error
      setName(''); setCategory(''); setDescription(''); setAddress(''); setPhone(''); setWebsite('')
      // mine will update via realtime; approved/pending lists will update based on status
    } catch (e) { showErr(e) } finally { setCreating(false) }
  }

  async function approve(id:number) {
    try {
      const { error } = await supabase.from('businesses').update({ status: 'approved' }).eq('id', id)
      if (error) throw error
    } catch (e) { showErr(e) }
  }
  async function reject(id:number) {
    try {
      const { error } = await supabase.from('businesses').update({ status: 'rejected' }).eq('id', id)
      if (error) throw error
    } catch (e) { showErr(e) }
  }

  return (
    <div>
      <h2>Business Directory</h2>

      {/* Submit form */}
      <div style={{ display:'grid', gap:8, margin:'12px 0' }}>
        <input placeholder="Business name" value={name} onChange={e=>setName(e.target.value)} />
        <input placeholder="Category (e.g. Cafe, Plumber)" value={category} onChange={e=>setCategory(e.target.value)} />
        <textarea placeholder="Short description" value={description} onChange={e=>setDescription(e.target.value)} />
        <input placeholder="Address" value={address} onChange={e=>setAddress(e.target.value)} />
        <input placeholder="Phone" value={phone} onChange={e=>setPhone(e.target.value)} />
        <input placeholder="Website (https://…)" value={website} onChange={e=>setWebsite(e.target.value)} />
        <button disabled={!me || creating} onClick={createBusiness}>{creating ? 'Submitting…' : 'Submit business'}</button>
      </div>

      {/* Approved list (public) */}
      <h3>Approved businesses</h3>
      <ul style={{ listStyle:'none', padding:0, display:'grid', gap:12 }}>
        {approved.map(b => (
          <li key={b.id} style={{ padding:12, border:'1px solid #e5e7eb', borderRadius:8 }}>
            <div style={{ fontWeight:600 }}>{b.name}</div>
            <div style={{ fontSize:12, opacity:0.8 }}>{b.category || '—'}</div>
            {b.description && <div style={{ marginTop:6 }}>{b.description}</div>}
            <div style={{ fontSize:12, opacity:0.75, marginTop:6 }}>
              {b.address || '—'} {b.phone ? `· ${b.phone}` : ''} {b.website ? <>· <a href={b.website} target="_blank" rel="noreferrer">website</a></> : null}
            </div>
          </li>
        ))}
      </ul>

      {/* My submissions */}
      {me && (
        <>
          <h3 style={{ marginTop:16 }}>My submissions</h3>
          <ul style={{ listStyle:'none', padding:0, display:'grid', gap:12 }}>
            {mine.map(b => (
              <li key={b.id} style={{ padding:12, border:'1px solid #e5e7eb', borderRadius:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                  <div style={{ fontWeight:600 }}>{b.name}</div>
                  <span style={{ fontSize:12, opacity:0.7 }}>{b.status.toUpperCase()}</span>
                </div>
                {b.description && <div style={{ marginTop:6 }}>{b.description}</div>}
                <div style={{ fontSize:12, opacity:0.75, marginTop:6 }}>
                  {b.address || '—'} {b.phone ? `· ${b.phone}` : ''} {b.website ? <>· <a href={b.website} target="_blank" rel="noreferrer">website</a></> : null}
                </div>
                {b.status !== 'approved' && (
                  <div style={{ marginTop:8, fontSize:12, opacity:0.7 }}>
                    You can edit this until it’s approved (edit UI coming next).
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Moderation queue */}
      {isMod && (
        <>
          <h3 style={{ marginTop:16 }}>Moderation queue</h3>
          <ul style={{ listStyle:'none', padding:0, display:'grid', gap:12 }}>
            {pending.map(b => (
              <li key={b.id} style={{ padding:12, border:'1px solid #fde68a', background:'#fffbeb', borderRadius:8 }}>
                <div style={{ fontWeight:700 }}>{b.name}</div>
                <div style={{ fontSize:12, opacity:0.8 }}>{b.category || '—'}</div>
                {b.description && <div style={{ marginTop:6 }}>{b.description}</div>}
                <div style={{ display:'flex', gap:8, marginTop:8 }}>
                  <button onClick={() => approve(b.id)}>Approve</button>
                  <button onClick={() => reject(b.id)}>Reject</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {err && <div style={{ color:'#b00020' }}>{err}</div>}
    </div>
  )
}
