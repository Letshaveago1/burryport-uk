// src/pages/Profile.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type Profile = {
  user_id: string
  username: string | null
  avatar_url: string | null
}

export default function Profile() {
  const [meId, setMeId] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const showErr = (e: any) => setErr(e?.message ?? String(e))

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser()
      const uid = data.user?.id ?? null
      setMeId(uid)
      if (!uid) return
      const { data: prof } = await supabase
        .from('profiles')
        .select('user_id,username,avatar_url')
        .eq('user_id', uid)
        .single()
      if (prof) {
        setUsername((prof as Profile).username ?? '')
        setAvatarUrl((prof as Profile).avatar_url ?? null)
      }
    })()
  }, [])

  async function save() {
    try {
      if (!meId) throw new Error('Please sign in first')
      setSaving(true)

      let newAvatarUrl = avatarUrl
      if (file) {
        // upload to public "avatars" bucket
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `${meId}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('avatars')
          .upload(path, file, { cacheControl: '3600', upsert: false })
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
        newAvatarUrl = pub.publicUrl
      }

      const { error } = await supabase
        .from('profiles')
        .update({ username: username.trim() || null, avatar_url: newAvatarUrl })
        .eq('user_id', meId)
      if (error) throw error

      setAvatarUrl(newAvatarUrl)
      setFile(null)
    } catch (e) { showErr(e) } finally { setSaving(false) }
  }

  if (!meId) {
    return (
      <div>
        <h2>Profile</h2>
        <p>Please sign in to edit your profile.</p>
      </div>
    )
  }

  return (
    <div>
      <h2>Profile</h2>
      <div style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
        <label>
          <div>Username</div>
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="yourname" />
        </label>

        <div>
          <div>Avatar</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src={file ? URL.createObjectURL(file) : (avatarUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==')}
              alt=""
              style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', background: '#eee' }}
            />
            <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        {err && <div style={{ color: '#b00020' }}>{err}</div>}
      </div>
    </div>
  )
}
