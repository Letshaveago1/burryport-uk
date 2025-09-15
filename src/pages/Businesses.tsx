import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../components/AuthProvider'

// 👇 NEW: SEO helpers
import { useHead } from '../lib/seo'
import { siteBase } from '../lib/schema'

type ImageObj = { url: string; alt?: string }
type Biz = {
  id: number
  name: string
  category: string | null
  address: string | null
  website: string | null
  phone: string | null
  images: ImageObj[] | null // may also be string/array-of-strings in older rows (we normalize below)
  owner_id: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at?: string
}

type Claim = {
  id: number
  business_id: number
  claimant_id: string
  status: 'pending' | 'approved' | 'rejected'
}

function ensureHttp(u?: string | null) {
  if (!u) return null
  if (/^https?:\/\//i.test(u)) return u
  if (u.startsWith('//')) return 'https:' + u
  return `https://${u}`
}

// Robustly pick a cover image URL from various possible shapes
function pickCoverUrl(images: unknown): string | null {
  if (!images) return null
  try {
    if (typeof images === 'string') return images
    if (Array.isArray(images)) {
      const first = images[0]
      if (!first) return null
      if (typeof first === 'string') return first
      if (typeof first === 'object' && first && 'url' in first) {
        return (first as { url?: string }).url ?? null
      }
    }
    if (typeof images === 'object' && images && 'url' in (images as any)) {
      return (images as { url?: string }).url ?? null
    }
  } catch {}
  return null
}

// Pretty placeholder if an external image fails to load (hotlink blocked, 404, etc)
const PLACEHOLDER_DATA_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320">
      <rect width="100%" height="100%" fill="#f3f4f6"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
            font-family="system-ui, sans-serif" font-size="14" fill="#9ca3af">
        image unavailable
      </text>
    </svg>`
  )

export default function Businesses() {
  const { ready, session } = useAuth()
  const me = session?.user?.id ?? null

  const [rows, setRows] = useState<Biz[]>([])
  const [myClaims, setMyClaims] = useState<Record<number, Claim>>({})
  const [err, setErr] = useState('')
  const showErr = (e: any) => setErr(e?.message ?? String(e))

  // Decide whether to crop or fit: logos/SVGs should not be cropped
  function chooseFit(url?: string | null) {
    if (!url) return 'cover' as const
    const lower = url.toLowerCase()
    return lower.endsWith('.svg') || lower.includes('logo') ? 'contain' : 'cover'
  }

  async function load() {
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('id,name,category,address,website,phone,images,owner_id,status,created_at')
        .eq('status', 'approved')
        .order('name', { ascending: true })
        .limit(500)
      if (error) throw error
      setRows((data || []) as Biz[])

      if (me) {
        const { data: claims } = await supabase
          .from('business_claims')
          .select('id,business_id,claimant_id,status')
          .eq('claimant_id', me)
          .in('status', ['pending', 'approved'])
          .limit(500)
        const map: Record<number, Claim> = {}
        for (const c of (claims || []) as Claim[]) map[c.business_id] = c
        setMyClaims(map)
      } else {
        setMyClaims({})
      }
    } catch (e) {
      showErr(e)
    }
  }

  useEffect(() => {
    if (ready) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // realtime refresh if any business row changes
  useEffect(() => {
    if (!ready) return
    const ch = supabase
      .channel('rt-public-biz')
      .on('postgres_changes', { event: '*', schema: 'app', table: 'businesses' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  async function claim(b: Biz) {
    try {
      if (!me) throw new Error('Please sign in to claim')
      if (b.owner_id) throw new Error('Already claimed')
      if (myClaims[b.id]) throw new Error('You already have an active claim for this business')
      const { error } = await supabase
        .from('business_claims')
        .insert([{ business_id: b.id, claimant_id: me, message: null }])
      if (error) throw error
      await load()
      alert('Claim submitted. An admin will review it.')
    } catch (e) {
      showErr(e)
    }
  }

  // ----------------- AIO / SEO layer -----------------
  const canonical = `${siteBase}/businesses`
  const pageTitle = 'Burry Port Businesses – Local Directory'
  const pageDesc = rows.length
    ? `Local businesses in Burry Port: ${rows.slice(0, 4).map(b => b.name).join(' • ')}${rows.length > 4 ? '…' : ''}`
    : 'Discover local businesses in Burry Port: cafés, shops, services and more.'

  // Build JSON-LD: ItemList + per-business LocalBusiness
  const jsonBlocks = useMemo(() => {
    // ItemList so crawlers know what’s on the page
    const itemList = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Burry Port Businesses',
      url: canonical,
      itemListElement: rows.map((b, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${canonical}#biz-${b.id}`
      }))
    }

    // LocalBusiness for each row (minimal but valid)
    const perBiz = rows.map((b) => {
      const url = `${canonical}#biz-${b.id}`
      const website = ensureHttp(b.website) || undefined
      const image = ensureHttp(pickCoverUrl(b.images as unknown) || null) || undefined

      // You can specialize @type later (Restaurant, Store, etc.). For now keep it generic.
      const block: any = {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: b.name,
        url,
        description: b.category || undefined,
        telephone: b.phone || undefined,
        image,
      }

      if (website) {
        block.sameAs = [website]
      }
      if (b.address) {
        block.address = {
          '@type': 'PostalAddress',
          streetAddress: b.address,
          addressLocality: 'Burry Port',
          addressRegion: 'Carmarthenshire',
          addressCountry: 'GB'
        }
      }
      return block
    })

    return [itemList, ...perBiz]
  }, [JSON.stringify(rows)])

  const ogImage = `${siteBase}/og/default.jpg`

  useHead({
    title: pageTitle,
    description: pageDesc,
    canonical,
    metas: [
      { property: 'og:title', content: pageTitle },
      { property: 'og:description', content: pageDesc },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: ogImage },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: ogImage }
    ],
    jsonLd: jsonBlocks
  })
  // ----------------- end AIO / SEO layer -------------

  return (
    <div>
      <h2>Businesses</h2>

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
        {rows.map((b) => {
          const rawCover = pickCoverUrl(b.images as unknown)
          const cover = ensureHttp(rawCover || null)
          const site = ensureHttp(b.website)
          const canClaim = !b.owner_id && !!me && !myClaims[b.id]
          const youOwn = b.owner_id === me
          const yourClaim = myClaims[b.id]

          return (
            <li
              id={`biz-${b.id}`}
              key={b.id}
              style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
                {/* Image column */}
                <div
                  style={{
                    background: '#f3f4f6',
                    width: '100%',
                    position: 'relative',
                    paddingTop: '75%', // 4:3 aspect ratio
                    overflow: 'hidden',
                  }}
                >
                  {cover ? (
                    <img
                      src={cover}
                      alt={
                        (Array.isArray(b.images) &&
                          (b.images[0] as any)?.alt) ||
                        b.name
                      }
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: chooseFit(cover),
                        objectPosition: 'center',
                        display: 'block',
                      }}
                      onError={(e) => {
                        const el = e.currentTarget as HTMLImageElement
                        el.onerror = null
                        el.src = PLACEHOLDER_DATA_URI
                      }}
                    />
                  ) : (
                    <div style={{ position: 'absolute', inset: 0 }} />
                  )}
                </div>

                {/* Details column */}
                <div style={{ padding: 10 }}>
                  <div style={{ fontWeight: 700 }}>{b.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>{b.category || '—'}</div>
                  {b.address && (
                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{b.address}</div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    {site && (
                      <a href={site} target="_blank" rel="noreferrer noopener">
                        Website
                      </a>
                    )}
                    {b.phone && <a href={`tel:${b.phone.replace(/\s+/g, '')}`}>Call</a>}
                  </div>

                  <div style={{ marginTop: 8 }}>
                    {youOwn && (
                      <span style={{ fontSize: 12, color: '#059669' }}>
                        You own this business
                      </span>
                    )}
                    {!youOwn && yourClaim && yourClaim.status === 'pending' && (
                      <span style={{ fontSize: 12, color: '#b45309' }}>
                        Your claim is pending review
                      </span>
                    )}
                    {!youOwn && canClaim && (
                      <button onClick={() => claim(b)} aria-label={`Claim ${b.name}`}>
                        Claim this business
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {rows.length === 0 && <div>No approved businesses yet.</div>}
      {err && <div style={{ color: '#b00020', marginTop: 10 }}>{err}</div>}
    </div>
  )
}
