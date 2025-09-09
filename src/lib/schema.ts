export const siteBase = 'https://burryport.uk'

export function placeSchema({ url, description }: { url: string; description?: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: 'Burry Port',
    address: {
      addressLocality: 'Burry Port',
      addressRegion: 'Carmarthenshire',
      addressCountry: 'GB',
    },
    url,
    description: description ?? '',
    geo: { '@type': 'GeoCoordinates', latitude: 51.684, longitude: -4.25 },
  }
}

export function touristAttractionSchema({
  name,
  url,
  description,
  image,
}: {
  name: string
  url: string
  description?: string
  image?: string
}) {
  const obj: any = {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name,
    url,
    description: description ?? '',
  }
  if (image) obj.image = image
  return obj
}

export function faqSchema(items: { q: string; a: string }[], url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
    url,
  }
}

export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  }
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'BurryPort.uk',
    url: siteBase,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteBase}/search?q={query}`,
      'query-input': 'required name=query',
    },
  }
}

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'BurryPort.uk',
    url: siteBase,
  }
}
