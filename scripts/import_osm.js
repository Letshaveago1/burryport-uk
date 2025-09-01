// scripts/import_osm.js
import 'dotenv/config'
import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

// --- startup logs -----------------------------------------------------------
console.log('Importer starting…')
console.log('Env check:', {
  hasUrl: !!process.env.SUPABASE_URL,
  hasService: !!process.env.SUPABASE_SERVICE_ROLE,
  dotenvPath: process.env.DOTENV_CONFIG_PATH || '(default .env)'
})

// --- supabase client (use the APP schema) -----------------------------------
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim()
const SUPABASE_SERVICE_ROLE = (process.env.SUPABASE_SERVICE_ROLE || '').trim()
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in env')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
  db: { schema: 'app' } // ← IMPORTANT: point at the "app" schema
})

// --- overpass query ----------------------------------------------------------
// Bounding box roughly around Burry Port / Pembrey (SW to NE). Tweak if needed.
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const bbox = '51.676,-4.311,51.708,-4.205'

// Add more categories here as you like.
const amenityRegex =
  'restaurant|cafe|pub|bar|fast_food|pharmacy|bank|atm|post_office|library|doctors|dentist|veterinary'

const query = `
[out:json][timeout:60];
(
  node["shop"](${bbox});
  way ["shop"](${bbox});
  node["amenity"~"${amenityRegex}"](${bbox});
  way  ["amenity"~"${amenityRegex}"](${bbox});
  node["tourism"="hotel"](${bbox});
  way  ["tourism"="hotel"](${bbox});
);
out center tags;
`

// --- helpers ----------------------------------------------------------------
function norm(v) {
  if (!v) return null
  // if it's a bare domain, add https://
  if (/^[\w.-]+\.[a-z]{2,}($|\/)/i.test(v) && !/^https?:\/\//i.test(v)) return `https://${v}`
  return String(v).trim()
}
const pickPhone   = (t) => norm(t['contact:phone'] || t.phone)
const pickWebsite = (t) => norm(t['contact:website'] || t.website)
const pickName    = (t) => (t.name || '').trim()
const pickCat     = (t) => t.shop || t.amenity || t.tourism || t.craft || null

function buildAddr(t) {
  const parts = [
    t['addr:housename'],
    [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '),
    t['addr:city'],
    t['addr:postcode']
  ].filter(Boolean)
  return parts.join(', ') || null
}

function toBusinessRow(el) {
  // el: { type: 'node'|'way'|'relation', id, tags, lat/lon or center{lat,lon} }
  const t = el.tags || {}
  const external_id = `${el.type}/${el.id}`
  const lat = el.lat ?? el.center?.lat ?? null
  const lon = el.lon ?? el.center?.lon ?? null

  return {
    source: 'osm',
    external_id,
    name: pickName(t) || '(Unnamed)',
    category: pickCat(t),
    description: t.description || t.cuisine || null,
    address: buildAddr(t),
    phone: pickPhone(t),
    website: pickWebsite(t),
    lat, lon,
    status: 'pending',
    owner_id: null,
    last_seen_at: new Date().toISOString()
  }
}

// --- main -------------------------------------------------------------------
async function run() {
  console.log('Querying Overpass…')
  const res = await axios.post(OVERPASS_URL, query, { headers: { 'Content-Type': 'text/plain' } })
  const elements = res.data?.elements || []
  console.log(`OSM returned ${elements.length} elements`)

  const rows = elements.map(toBusinessRow).filter(r => r.name || r.category || r.address)
  if (rows.length === 0) {
    console.log('No usable rows found.')
    return
  }

  // Upsert in chunks (requires unique index on (source, external_id))
  const chunk = 200
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk)
    const { error } = await supabase
      .from('businesses') // points to app.businesses because of db.schema above
      .upsert(slice, {
        onConflict: 'source,external_id',
        ignoreDuplicates: false,
        defaultToNull: false
      })
    if (error) {
      console.error('Upsert error:', error)
      process.exit(1)
    }
    console.log(`Upserted ${slice.length} (progress ${i + slice.length}/${rows.length})`)
  }

  console.log('Done. Review in Businesses page (pending → approve).')
}

run().catch(e => {
  console.error(e?.response?.data || e)
  process.exit(1)
})
