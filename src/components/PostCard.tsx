import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Post, Profile } from '../types'

type CommentRow = {
  id: number
  author_id: string | null
  post_id: number
  content: string
  created_at: string
}

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
    <div className="p-4 bg-white border border-gray-200 rounded-lg">
      {/* header: avatar + author + date */}
      <div className="flex items-center gap-3">
        <img
          src={author?.avatar_url || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}
          alt=""
          className="w-10 h-10 rounded-full object-cover bg-gray-200 flex-shrink-0"
        />
        <div>
          <div className="font-semibold text-charcoal">{post.title}</div>
          <div className="text-xs text-gray-500">
            {author?.username ? `@${author.username}` : '—'} · {new Date(post.created_at).toLocaleString()}
          </div>
        </div>
      </div>

      {post.images && Array.isArray(post.images) && post.images[0]?.url && (
        <img src={post.images[0].url} alt={post.images[0].alt ?? ''} className="mt-3 max-w-full rounded-lg" />
      )}

      {post.content && <div className="mt-2 whitespace-pre-wrap">{post.content}</div>}

      {/* actions */}
      <div className="flex gap-4 items-center mt-3">
        <button onClick={toggleLike} className="text-sm text-charcoal hover:text-teal-700">
          {liked ? '♥ Unlike' : '♡ Like'} ({likesCount})
        </button>
        <button onClick={openComments} className="text-sm text-charcoal hover:text-teal-700">
          {commentsOpen ? 'Hide comments' : `Show ${comments.length > 0 ? comments.length + ' ' : ''}comments`}
        </button>
      </div>

      {/* comments */}
      {commentsOpen && (
        <div className="mt-3 grid gap-3">
          <div className="flex gap-2">
            <input placeholder="Write a comment…" value={newComment} onChange={e => setNewComment(e.target.value)} className="flex-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500" />
            <button onClick={addComment} disabled={!newComment.trim()} className="px-4 py-2 text-sm bg-sand text-charcoal rounded-md hover:bg-opacity-80 disabled:opacity-50">Post</button>
          </div>

          <ul className="list-none p-0 grid gap-3">
            {comments.map(c => (
              <li key={c.id} className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                <div className="text-sm">{c.content}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(c.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {err && <div className="text-coral mt-2 text-sm">{err}</div>}
    </div>
  )
}
