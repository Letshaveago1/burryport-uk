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
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-charcoal">Profile</h2>
      <div className="grid gap-6 max-w-lg p-4 bg-white border border-gray-200 rounded-lg">
        <label htmlFor={idUsername} className="block text-sm font-medium text-gray-700">
          Username
          <input
            id={idUsername}
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="yourname"
            autoComplete="nickname"
            className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
          />
        </label>

        <div>
          <label htmlFor={idAvatar} className="block text-sm font-medium text-gray-700">
            Avatar
          </label>

          <div className="mt-1 flex items-center gap-4">
            <img
              src={displayAvatar}
              alt={altText}
              className="w-16 h-16 rounded-full object-cover bg-gray-200"
            />
            <label htmlFor={idAvatar} className="cursor-pointer px-3 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50">
              Change
              <input id={idAvatar} type="file" accept="image/*" className="sr-only" onChange={e => onPickFile(e.target.files?.[0] ?? null)} />
            </label>
            {(avatarUrl || previewUrl) && (
              <button type="button" onClick={removeCurrentAvatar} title="Remove avatar" className="text-sm text-coral hover:underline">
                Remove
              </button>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-2">
            JPG/PNG/WebP, up to 5&nbsp;MB.
          </div>
        </div>

        <button type="button" onClick={save} disabled={saving} aria-busy={saving} className="w-full sm:w-auto px-6 py-2 bg-charcoal text-white font-semibold rounded-md shadow-sm hover:bg-opacity-90 disabled:bg-gray-400 disabled:cursor-not-allowed">
          {saving ? 'Saving…' : 'Save changes'}
        </button>

        {err && <div className="text-coral" aria-live="polite">{err}</div>}
      </div>
    </div>
  )
}
