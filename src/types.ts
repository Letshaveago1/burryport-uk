export type Post = {
  id: number
  author_id: string | null
  title: string
  content: string | null
  created_at: string
  images?: { url: string; alt?: string }[] | null
}
