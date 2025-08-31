import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Post } from '../types'   // ← add
// remove the local 'type Post = { ... }' block



type CommentRow = {
  id: number
  author_id: string | null
  post_id: number
  content: string
  created_at: string
}

type Profile = { username: string | null; avatar_url: string | null }

export default function PostCard({ post }: { post: Post }) {
  const [likesCount, setLikesCount] = useState<number>(0)
  const [liked, setLiked] = useState<boolean>(false)
  const [meId, setMeId] = useState<string | null>(null)

  const [author, setAuthor] = useState<Profile | null>(null)

  const [commentsOpen, setCommentsOpen] = useState(false)
  const [comments, setComments] = useState<CommentRow[]>([])
  const [newComment, setNewComment] = useState('')
  const [err, setErr] = useState('')

  const showErr = (e: any) => setErr(e?.message ?? String(e))

  // Author profile (username + avatar)
  useEffect(() => {
    (async () => {
      if (!post.author_id) { setAuthor(null); return }
      const { data, error } = await supabase
        .from('profiles')
        .select('username,avatar_url')
        .eq('user_id', post.author_id)
        .single()
      if (!error) setAuthor(data as Profile)
    })()
  }, [post.author_id])

  // Likes initial load
  useEffect(() => {
    (async () => {
      try {
        const { data: me } = await supabase.auth.getUser()
        const uid = me.user?.id ?? null
        setMeId(uid)

        const { count, error: countErr } = await supabase
          .from('likes')
          .select('*', { count: 'exact', head: true })
          .eq('post_id', post.id)
          .is('comment_id', null)
        if (countErr) throw countErr
        setLikesCount(count ?? 0)

        if (uid) {
          const { data: mine, error: mineErr } = await supabase
            .from('likes')
            .select('user_id')
            .eq('post_id', post.id)
            .eq('user_id', uid)
            .is('comment_id', null)
            .limit(1)
          if (mineErr) throw mineErr
          setLiked((mine?.length ?? 0) > 0)
        }
      } catch (e) { showErr(e) }
    })()
  }, [post.id])

  async function toggleLike() {
    try {
      if (!meId) throw new Error('Sign in to like posts')
      if (liked) {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('user_id', meId)
          .eq('post_id', post.id)
          .is('comment_id', null)
        if (error) throw error
        setLiked(false)
        setLikesCount(n => Math.max(0, n - 1))
      } else {
        const { error } = await supabase
          .from('likes')
          .insert([{ user_id: meId, post_id: post.id }])
        if (error) throw error
        setLiked(true)
        setLikesCount(n => n + 1)
      }
    } catch (e) { showErr(e) }
  }

  async function openComments() {
    try {
      if (commentsOpen) { setCommentsOpen(false); return }
      const { data, error } = await supabase
        .from('comments')
        .select('id,author_id,post_id,content,created_at')
        .eq('post_id', post.id)
        .order('created_at', { ascending: true })
        .limit(50)
      if (error) throw error
      setComments(data as CommentRow[])
      setCommentsOpen(true)

      const ch = supabase
        .channel(`comments-post-${post.id}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'app', table: 'comments', filter: `post_id=eq.${post.id}` },
          (payload) => setComments(prev => [...prev, payload.new as CommentRow])
        )
        .subscribe()
      const stop = () => { supabase.removeChannel(ch) }
      // stop on unmount or when closed
      return () => stop()
    } catch (e) { showErr(e) }
  }

  async function addComment() {
    try {
      const { data: me } = await supabase.auth.getUser()
      if (!me.user) throw new Error('Sign in to comment')
      if (!newComment.trim()) return
      const { error } = await supabase
        .from('comments')
        .insert([{ post_id: post.id, author_id: me.user.id, content: newComment.trim() }])
      if (error) throw error
      setNewComment('')
    } catch (e) { showErr(e) }
  }

  return (
    <li style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8 }}>
      {/* header: avatar + author + date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img
          src={author?.avatar_url || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}
          alt=""
          style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', background: '#eee' }}
        />
        <div style={{ fontWeight: 600 }}>
          {post.title}
          <div style={{ fontWeight: 400, fontSize: 12, opacity: 0.7 }}>
            {author?.username ? `@${author.username}` : '—'} · {new Date(post.created_at).toLocaleString()}
          </div>
        </div>
      </div>

      {post.images && Array.isArray(post.images) && post.images[0]?.url && (
        <img
          src={post.images[0].url}
          alt={post.images[0].alt ?? ''}
          style={{ maxWidth: '100%', borderRadius: 8, marginTop: 8 }}
        />
      )}

      {post.content && (
        <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{post.content}</div>
      )}

      {/* actions */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
        <button onClick={toggleLike}>
          {liked ? '♥ Unlike' : '♡ Like'} ({likesCount})
        </button>
        <button onClick={openComments}>
          {commentsOpen ? 'Hide comments' : `Show comments (${comments.length})`}
        </button>
      </div>

      {/* comments */}
      {commentsOpen && (
        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="Write a comment…"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              style={{ flex: 1 }}
            />
            <button onClick={addComment} disabled={!newComment.trim()}>Post</button>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {comments.map(c => (
              <li key={c.id} style={{ padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
                <div style={{ whiteSpace: 'pre-wrap' }}>{c.content}</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  {new Date(c.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {err && <div style={{ color: '#b00020', marginTop: 6 }}>{err}</div>}
    </li>
  )
}
