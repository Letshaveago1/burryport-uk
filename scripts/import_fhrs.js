// scripts/import_fhrs.js
// ESM script to import UK Food Hygiene (FHRS) establishments into app.businesses

import axios from 'axios'

// --- env --------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE
const AUTH_NAME    = process.env.FHRS_AUTHORITY_NAME || ''          // e.g. "Carmarthenshire"
const AUTH_ID_ENV  = process.env.FHRS_LOCAL_AUTHORITY_ID || ''      // optional numeric ID as string
const PC_FILTERS   = (process.env.FHRS_POSTCODES || '')
  .split(',')
  .map(s => s.trim().toUpperCase())
  .filter(Boolean)

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE')
  process.exit(1)
}

console.log('FHRS importer starting…')
console.log('Env check:', {
  hasUrl: !!SUPABASE_URL,
  hasService: !!SERVICE_KEY,
  dotenvPath: process.env.DOTENV_CONFIG_PATH || '(default .env)',
  authName: AUTH_NAME || '(none)',
  authId: AUTH_ID_ENV || '(none)',
  postcodeFilters: PC_FILTERS.join(',') || '(none)'
})

// --- clients ----------------------------------------------------------------
const fhrs = axios.create({
  baseURL: 'https://api.ratings.food.gov.uk',
  headers: {
    'x-api-version': '2',
    accept: 'application/json'
  },
  timeout: 30000
})

// IMPORTANT: use Content-Profile / Accept-Profile to point to the `app` schema.
// Do NOT put `app.` in the URL path—use `/businesses`, not `/app.businesses`.
const rest = axios.create({
  baseURL: `${SUPABASE_URL}/rest/v1`,
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates',
    'Content-Profile': 'app',
    'Accept-Profile': 'app'
  },
  timeout: 30000,
  maxContentLength: 10 * 1024 * 1024,
  maxBodyLength: 10 * 1024 * 1024
})

// --- helpers ----------------------------------------------------------------
function mkAddress(e) {
  const t1 = e.AddressLine1 || ''
  const t2 = e.AddressLine2 || ''
  const t3 = e.AddressLine3 || ''
  const t4 = e.AddressLine4 || ''
  const pc = e.PostCode || ''
  return [t1, t2, t3, t4, pc].filter(Boolean).join(', ')
}

function pickPhone(e) {
  const v = e.Phone
  return v && String(v).trim() ? String(v).trim() : null
}

function pickWeb(e) {
  let v = e.Website
  if (!v || !String(v).trim()) return null
  v = String(v).trim()
  // normalise bare domains
  if (/^[\w.-]+\.[a-z]{2,}($|\/)/i.test(v) && !/^https?:\/\//i.test(v)) v = `https://${v}`
  return v
}

function pickCategory(e) {
  return e.BusinessType || null // FHRS gives human-readable category
}

function parseLatLon(e) {
  const lat =
    parseFloat(e?.geocode?.Latitude) ??
    parseFloat(e?.Geocode?.Latitude) ??
    parseFloat(e?.Latitude)
  const lon =
    parseFloat(e?.geocode?.Longitude) ??
    parseFloat(e?.Geocode?.Longitude) ??
    parseFloat(e?.Longitude)
  const okLat = Number.isFinite(lat)
  const okLon = Number.isFinite(lon)
  return { lat: okLat ? lat : null, lon: okLon ? lon : null }
}

async function getAuthorityIdByName(name) {
  const r = await fhrs.get('/Authorities/basic') // id + name list
  const list = r.data?.authorities || []
  const match = list.find(a => a.Name?.toLowerCase() === name.toLowerCase())
  if (!match) throw new Error(`FHRS authority not found by name: "${name}"`)
  return match.LocalAuthorityId
}

async function* pagedEstablishments(localAuthorityId) {
  let page = 1
  const pageSize = 500 // FHRS allows up to 500
  for (;;) {
    const r = await fhrs.get('/Establishments', {
      params: { localAuthorityId, pageNumber: page, pageSize }
    })
    const items = r.data?.establishments || []
    if (!items.length) break
    yield items
    page += 1
  }
}

async function upsertBatched(rows, chunkSize = 400) {
  let total = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize)
    try {
      await rest.post('/businesses', slice)
      total += slice.length
      console.log(`Upserted ${total}/${rows.length}`)
    } catch (err) {
      console.error('Upsert error on chunk', i, '→', (err.response?.data || err.message))
      throw err
    }
  }
}

// --- main -------------------------------------------------------------------
async function run() {
  const authorityId = AUTH_ID_ENV || (AUTH_NAME ? await getAuthorityIdByName(AUTH_NAME) : '')
  if (!authorityId) throw new Error('Provide FHRS_LOCAL_AUTHORITY_ID or FHRS_AUTHORITY_NAME')
  console.log(`AuthorityId resolved: ${authorityId}`)

  const out = []
  for await (const batch of pagedEstablishments(authorityId)) {
    for (const e of batch) {
      const name = e.BusinessName?.trim()
      const postcode = (e.PostCode || '').toUpperCase()

      // Optional filter by postcode prefix list (e.g. SA16,SA15)
      if (PC_FILTERS.length && !PC_FILTERS.some(p => postcode.startsWith(p))) {
        continue
      }

      const { lat, lon } = parseLatLon(e)

      out.push({
        source: 'fhrs',
        external_id: String(e.FHRSID),
        name,
        category: pickCategory(e),
        description: null,
        address: mkAddress(e),
        phone: pickPhone(e),
        website: pickWeb(e),
        images: [],                // keep lightweight; you can enrich later
        status: 'pending',         // enter moderation queue
        last_seen_at: new Date().toISOString(),
        postcode: postcode || null,
        lat,
        lon
      })
    }
  }

  if (!out.length) {
    console.log('No establishments matched (check authority or postcode filters).')
    return
  }

  console.log(`Upserting ${out.length} rows…`)
  await upsertBatched(out)
  console.log('Done.')
}

run().catch(err => { console.error(err); process.exit(1) })
