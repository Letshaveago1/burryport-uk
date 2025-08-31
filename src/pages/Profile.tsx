import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Profile() {
  const [uid, setUid] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  const [pick, setPick] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const showErr = (e: any) => setErr(e?.message ?? String(e))

  useEffect(() => {
    (async () => {
      const { data: me } = await supabase.auth.getUser()
      const id = me.user?.id ?? null
      if (!id) { setErr('Please sign in.'); return }
      setUid(id)
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('username,full_name,avatar_url')
          .eq('user_id', id)
          .single()
        if (error) throw error
        setUsername(data?.username ?? '')
        setFullName(data?.full_name ?? '')
        setAvatarUrl(data?.avatar_url ?? null)
      } catch (e) { showErr(e) }
    })()
  }, [])

  function onPickFile(f: File | null) {
    setPick(f)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  async function resizeSquare(file: File, size = 256): Promise<Blob> {
    const img = document.createElement('img')
    const url = URL.createObjectURL(file)
    try {
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('Image load failed'))
        img.src = url
      })
      const canvas = document.createElement('canvas')
      const s = Math.min(img.width, img.height)
      const sx = Math.floor((img.width - s) / 2)
      const sy = Math.floor((img.height - s) / 2)
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size)
      const quality = 0.9
      const blob: Blob | null =
        (await new Promise(res => canvas.toBlob(res, 'image/webp', quality))) ||
        (await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality)))
      if (!blob) throw new Error('Avatar encode failed')
      return blob
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  async function save() {
    if (!uid) return
    setSaving(true)
    setErr('')
    try {
      let newAvatarUrl: string | null = avatarUrl

      if (pick) {
        const blob = await resizeSquare(pick, 256)
        const ext = blob.type.includes('webp') ? 'webp' : 'jpg'
        const path = `${uid}/avatar.${ext}`

        // upsert: overwrite existing avatar
        const { error: upErr } = await supabase.storage
          .from('avatars')
          .upload(path, blob, { cacheControl: '3600', upsert: true, contentType: blob.type })
        if (upErr) throw upErr

        const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
        newAvatarUrl = pub.publicUrl
      }

      const { error } = await supabase
        .from('profiles')
        .update({ username: username || null, full_name: fullName || null, avatar_url: newAvatarUrl })
        .eq('user_id', uid)
      if (error) throw error

      setAvatarUrl(newAvatarUrl)
      setPick(null); if (preview) { URL.revokeObjectURL(preview); setPreview(null) }
      alert('Saved!')
    } catch (e: any) {
      // Friendly message for username uniqueness
      const msg = String(e?.message ?? e)
      if (msg.includes('duplicate key') || msg.includes('unique')) {
        setErr('That username is taken. Try another.')
      } else {
        setErr(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2>Profile</h2>
      {!uid && <div>Please sign in.</div>}

      <div style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
        <label>
          Username
          <input
            value={username}
            onChange={e => setUsername(e.target.value.trim())}
            placeholder="e.g. burrybeachfan"
          />
        </label>

        <label>
          Full name
          <input
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Your name"
          />
        </label>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <img
              src={preview || avatarUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}
              alt=""
              style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', background: '#eee' }}
            />
            <input type="file" accept="image/*" onChange={e => onPickFile(e.target.files?.[0] ?? null)} />
            {preview && <button onClick={() => onPickFile(null)}>Remove</button>}
          </div>
          <small style={{ opacity: 0.7 }}>Square image recommended. We’ll crop/resize to 256×256.</small>
        </div>

        <button onClick={save} disabled={!uid || saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>

        {err && <div style={{ color: '#b00020' }}>{err}</div>}
      </div>
    </div>
  )
}
