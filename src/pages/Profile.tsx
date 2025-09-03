// src/pages/Profile.tsx
import { useEffect, useId, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type Profile = {
  user_id: string
  username: string | null
  avatar_url: string | null
}

const PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

export default function Profile() {
  const [meId, setMeId] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const idUsername = useId()
  const idAvatar = useId()

  const showErr = (e: any) => setErr(e?.message ?? String(e))

  // Load current user + profile
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser()
      const uid = data.user?.id ?? null
      setMeId(uid)
      if (!uid) return

      const { data: prof, error } = await supabase
        .from('profiles')
        .select('user_id,username,avatar_url')
        .eq('user_id', uid)
        .single()

      // If no row exists yet, create one (harmless if it already exists)
      if (error && error.code === 'PGRST116') {
        await supabase.from('profiles').insert([{ user_id: uid }])
      }

      if (prof) {
        const p = prof as Profile
        setUsername(p.username ?? '')
        setAvatarUrl(p.avatar_url ?? null)
      }
    })()
  }, [])

  // Manage preview URL lifecycle
  useEffect(() => {
    if (!file) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
        setPreviewUrl(null)
      }
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  function onPickFile(f: File | null) {
    if (f && f.size > 5 * 1024 * 1024) {
      showErr('Please choose an image under 5 MB.')
      return
    }
    setErr('')
    setFile(f)
  }

  async function save() {
    try {
      if (!meId) throw new Error('Please sign in first')
      setSaving(true)

      let newAvatarUrl = avatarUrl

      // If a new file is selected, upload to public "avatars" bucket
      if (file) {
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
    } catch (e) {
      showErr(e)
    } finally {
      setSaving(false)
    }
  }

  function removeCurrentAvatar() {
    setAvatarUrl(null)
    setFile(null)
    setPreviewUrl(null)
  }

  if (!meId) {
    return (
      <div>
        <h2>Profile</h2>
        <p>Please sign in to edit your profile.</p>
      </div>
    )
  }

  const displayAvatar = previewUrl || avatarUrl || PLACEHOLDER
  const altText =
    username?.trim()
      ? `${username}'s avatar`
      : 'User avatar'

  return (
    <div>
      <h2>Profile</h2>
      <div style={{ display: 'grid', gap: 10, maxWidth: 460 }}>
        <label htmlFor={idUsername}>
          <div>Username</div>
          <input
            id={idUsername}
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="yourname"
            autoComplete="nickname"
          />
        </label>

        <div>
          <label htmlFor={idAvatar}>
            <div>Avatar</div>
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src={displayAvatar}
              alt={altText}
              style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', background: '#eee' }}
            />
            <input
              id={idAvatar}
              type="file"
              accept="image/*"
              onChange={e => onPickFile(e.target.files?.[0] ?? null)}
            />
            {(avatarUrl || previewUrl) && (
              <button type="button" onClick={removeCurrentAvatar} title="Remove avatar">
                Remove
              </button>
            )}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
            JPG/PNG/WebP, up to 5&nbsp;MB.
          </div>
        </div>

        <button type="button" onClick={save} disabled={saving} aria-busy={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>

        {err && (
          <div style={{ color: '#b00020' }} aria-live="polite">
            {err}
          </div>
        )}
      </div>
    </div>
  )
}
