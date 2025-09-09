import { writeFileSync } from 'node:fs'

const base = 'https://burryport.uk'
// Keep this list in sync with slugs you publish
const routes = ['/', '/history', '/tourism', '/wildlife', '/earhart', '/harbour', '/events', '/businesses', '/faq']

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    r => `<url>
  <loc>${base}${r}</loc>
  <changefreq>${r === '/' ? 'daily' : 'weekly'}</changefreq>
  <priority>${r === '/' ? '1.0' : '0.7'}</priority>
</url>`
  )
  .join('\n')}
</urlset>`

writeFileSync('public/sitemap.xml', xml)
console.log('✅ sitemap.xml written with', routes.length, 'routes')
