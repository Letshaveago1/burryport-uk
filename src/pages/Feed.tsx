// src/pages/Feed.tsx
import { useEffect, useId, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import RequireAuth from '../components/auth/RequireAuth'
import { useSessionEmail } from '../hooks/useSession'
import { signOut as doSignOut } from '../lib/auth'

import PostCard from '../components/PostCard'
import type { Post } from '../types'

// SEO helpers
import { useHead } from '../lib/seo'
import { websiteSchema, organizationSchema, siteBase } from '../lib/schema'

export default function Feed() {
  // SEO + JSON-LD
  useHead({
    title: 'Burry Port – Local Guide & Live Info',
    description: 'Mobile-first guide to Burry Port: harbour, coastal path, Pembrey Country Park, events and businesses.',
    canonical: siteBase,
    metas: [
      { property: 'og:title', content: 'Burry Port – Local Guide & Live Info' },
      { property: 'og:description', content: 'Harbour, coastal path, Pembrey Country Park, events and businesses.' },
      { name: 'theme-color', content: '#0A6E7D' }
    ],
    jsonLd: [websiteSchema(), organizationSchema()],
  })

  // Signed-in user email (read-only)
  const userEmail = useSessionEmail()

  // Form state for creating a post
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  // Image upload UI
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Feed data
  const [posts, setPosts] = useState<Post[]>([])
  const [err, setErr] = useState('')

  const showErr = (e: any) => setErr(e?.message ?? String(e))

  // ---------- IDs for labels ----------
  const idTitle = useId()
  const idContent = useId()
  const idFile = useId()

  // ---- data ---------------------------------------------------------------

  async function fetchPosts() {
    try {
      const { data, error } = await supabase
        .from('posts') // schema-qualified
        .select('id,author_id,title,content,created_at,images')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      setPosts((data ?? []) as Post[])
    } catch (e) { showErr(e) }
  }

  useEffect(() => {
    fetchPosts()

    const ch = supabase
      .channel('posts-rt')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'app', table: 'posts' },
        (payload) => setPosts(prev => [payload.new as Post, ...prev])
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [])

  // ---- image helpers ------------------------------------------------------

  function onPickFile(f: File | null) {
    setFile(f)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(f ? URL.createObjectURL(f) : null)
  }

  // Resize to max dimension 1200px and output WebP with JPEG fallback.
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

  // ---- create post --------------------------------------------------------

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
        .from('posts') // schema-qualified
        .insert([{ author_id: me.user.id, title, content, images, tags: ['news'] }])

      if (error) {
        // cleanup uploaded file if DB insert fails
        if (images[0]?.url) {
          const url = new URL(images[0].url)
          const key = decodeURIComponent(url.pathname.split('/object/public/post-images/')[1] || '')
          if (key) await supabase.storage.from('post-images').remove([key]).catch(() => { })
        }
        throw error
      }

      setTitle(''); setContent('')
      onPickFile(null)
      // optional: optimistic prepend handled by realtime; no refetch needed
    } catch (e) {
      showErr(e)
    } finally {
      setUploading(false)
    }
  }

  // ---- render -------------------------------------------------------------

  return (
    <RequireAuth next="/feed">
      <div className="space-y-6">
        <h2 className="text-3xl font-bold text-charcoal">Feed</h2>

        {userEmail && (
          <div className="text-sm flex items-center gap-3">
            <span>Signed in as <b className="font-semibold">{userEmail}</b></span>
            <button
              type="button"
              onClick={doSignOut}
              className="text-sea hover:underline"
            >
              Sign out
            </button>
          </div>
        )}

        <div className="grid gap-4">
          <label htmlFor={idTitle}>
            <span className="block text-sm font-medium text-gray-700">Post title</span>
            <input
              id={idTitle}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What’s happening?"
              className="mt-1 block w-full px-3 py-2 bg-white/70 border border-sea/30 rounded-md shadow-sm placeholder-charcoal/50 focus:outline-none focus:ring-sea focus:border-sea sm:text-sm"
            />
          </label>

          <label htmlFor={idContent}>
            <span className="block text-sm font-medium text-gray-700">Post content</span>
            <textarea id={idContent} value={content} onChange={e => setContent(e.target.value)} placeholder="Add details…" className="mt-1 block w-full px-3 py-2 bg-white/70 border border-sea/30 rounded-md shadow-sm placeholder-charcoal/50 focus:outline-none focus:ring-sea focus:border-sea sm:text-sm" />
          </label>
        </div>

        <div className="grid gap-2">
          <label htmlFor={idFile}>
            <span className="block text-sm font-medium text-gray-700">Attach an image (optional)</span>
            <input id={idFile} type="file" accept="image/*" onChange={e => onPickFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sand file:text-charcoal hover:file:bg-opacity-80" />
          </label>
          {previewUrl && (
            <div className="flex items-center gap-4">
              <img src={previewUrl} alt={title ? `Preview: ${title}` : 'Selected image preview'} className="max-h-32 rounded-lg" />
              <button type="button" onClick={() => onPickFile(null)} className="text-sm text-lighthouse hover:underline">Remove image</button>
            </div>
          )}
        </div>

        <button type="button" disabled={!userEmail || !title.trim() || uploading} onClick={createPost} aria-busy={uploading} className="w-full sm:w-auto px-6 py-2 bg-lighthouse text-white font-semibold rounded-md shadow-sm hover:bg-opacity-90 disabled:bg-gray-400 disabled:cursor-not-allowed">
          {uploading ? 'Uploading…' : 'Create Post'}
        </button>

        {err && <div className="text-lighthouse" aria-live="polite">{err}</div>}

        <ul className="list-none p-0 flex flex-col gap-4">
          {posts.map(p => <PostCard key={p.id} post={p} />)}
        </ul>
      </div>
    </RequireAuth>
  )
}
