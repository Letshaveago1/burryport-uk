import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import PostCard from '../components/PostCard'
import type { Post } from '../types'   // ← add
// remove the local 'type Post = { ... }' block



export default function Feed() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  // image upload UI
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const [posts, setPosts] = useState<Post[]>([])
  const [err, setErr] = useState('')

  const showErr = (e: any) => setErr(e?.message ?? String(e))

  // ---- auth + data ---------------------------------------------------------

  async function refreshAuth() {
    const { data } = await supabase.auth.getUser()
    setUserEmail(data.user?.email ?? null)
  }

  async function fetchPosts() {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('id,author_id,title,content,created_at,images')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      setPosts(data as Post[])
    } catch (e) { showErr(e) }
  }

  useEffect(() => {
    refreshAuth()
    fetchPosts()

    const ch = supabase
      .channel('posts-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'app', table: 'posts' }, (payload) => {
        setPosts(prev => [payload.new as Post, ...prev])
      })
      .subscribe()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null)
    })

    return () => {
      supabase.removeChannel(ch)
      subscription.unsubscribe()
    }
  }, [])

  // ---- auth actions --------------------------------------------------------

  async function signIn() {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
      if (error) throw error
      setEmail(''); setPw('')
      await refreshAuth()
    } catch (e) { showErr(e) }
  }

  async function signInWithGoogle() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      })
      if (error) throw error
    } catch (e) { showErr(e) }
  }

  async function signOut() {
    await supabase.auth.signOut()
    await refreshAuth()
  }

  // ---- image helpers -------------------------------------------------------

  function onPickFile(f: File | null) {
    setFile(f)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(f ? URL.createObjectURL(f) : null)
  }

  // Resize to max dimension 1200px and output WebP (smaller) with fallback to JPEG.
  async function resizeImage(file: File, maxSize = 1200): Promise<Blob> {
    const img = document.createElement('img')
    const url = URL.createObjectURL(file)
    try {
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('Image load failed'))
        img.src = url
      })
      const { width, height } = img
      const scale = Math.min(1, maxSize / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas unsupported')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const quality = 0.82
      const blob: Blob | null =
        (await new Promise(res => canvas.toBlob(res, 'image/webp', quality))) ||
        (await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality)))
      if (!blob) throw new Error('Image encode failed')
      return blob
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  function safeName(name: string) {
    return name.toLowerCase().replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  }

  // ---- create post ---------------------------------------------------------

  async function createPost() {
    try {
      const { data: me } = await supabase.auth.getUser()
      if (!me.user) throw new Error('Sign in first')

      setUploading(true)
      let images: { url: string; alt?: string }[] = []

      if (file) {
        const blob = await resizeImage(file, 1200)
        const ext = blob.type.includes('webp') ? 'webp' : 'jpg'
        const base = safeName(file.name.replace(/\.[^.]+$/, '')) || 'image'
        const path = `${me.user.id}/${Date.now()}-${base}.${ext}`

        const { error: upErr } = await supabase.storage
          .from('post-images')
          .upload(path, blob, { cacheControl: '3600', upsert: false, contentType: blob.type })
        if (upErr) throw upErr

        const { data: pub } = supabase.storage.from('post-images').getPublicUrl(path)
        images = [{ url: pub.publicUrl, alt: title }]
      }

      const { error } = await supabase
        .from('posts')
        .insert([{ author_id: me.user.id, title, content, images, tags: ['news'] }])
      if (error) {
        if (images[0]?.url) {
          const url = new URL(images[0].url)
          const key = decodeURIComponent(url.pathname.split('/object/public/post-images/')[1] || '')
          if (key) await supabase.storage.from('post-images').remove([key]).catch(() => {})
        }
        throw error
      }

      setTitle(''); setContent('')
      onPickFile(null)
    } catch (e) {
      showErr(e)
    } finally {
      setUploading(false)
    }
  }

  // ---- render --------------------------------------------------------------

  return (
    <div>
      <h2>Feed</h2>

      <div style={{ display: 'grid', gap: 8, margin: '8px 0' }}>
        {userEmail ? (
          <div>
            Signed in as <b>{userEmail}</b>{' '}
            <button onClick={signOut}>Sign out</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input placeholder="email" value={email} onChange={e => setEmail(e.target.value)} />
            <input placeholder="password" type="password" value={pw} onChange={e => setPw(e.target.value)} />
            <button onClick={signIn}>Sign in</button>
            <span style={{ alignSelf: 'center', opacity: 0.6 }}>or</span>
            <button onClick={signInWithGoogle} style={{ border: '1px solid #ccc' }}>
              Continue with Google
            </button>
          </div>
        )}

        <input placeholder="Post title" value={title} onChange={e => setTitle(e.target.value)} />
        <textarea placeholder="Post content" value={content} onChange={e => setContent(e.target.value)} />

        {/* Image picker + preview */}
        <div style={{ display: 'grid', gap: 6 }}>
          <input
            type="file"
            accept="image/*"
            onChange={e => onPickFile(e.target.files?.[0] ?? null)}
          />
          {previewUrl && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <img src={previewUrl} alt="" style={{ maxHeight: 120, borderRadius: 8 }} />
              <button onClick={() => onPickFile(null)}>Remove image</button>
            </div>
          )}
        </div>

        <button
          disabled={!userEmail || !title.trim() || uploading}
          onClick={createPost}
        >
          {uploading ? 'Uploading…' : 'Create Post'}
        </button>
      </div>

      {/* ↓↓↓ This is the only part you needed to swap ↓↓↓ */}
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
        {posts.map(p => (
          <PostCard key={p.id} post={p} />
        ))}
      </ul>
      {/* ↑↑↑ Replace your old <li>...</li> mapping with this ↑↑↑ */}

      {err && <div style={{ color: '#b00020' }}>{err}</div>}
    </div>
  )
}
