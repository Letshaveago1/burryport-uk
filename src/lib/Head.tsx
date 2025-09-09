import { useEffect } from 'react'

type Tag = { name?: string; property?: string; content: string }

export function useHead({
  title,
  description,
  canonical,
  metas = [],
  jsonLd
}: {
  title?: string
  description?: string
  canonical?: string
  metas?: Tag[]
  jsonLd?: object
}) {
  useEffect(() => {
    const prevTitle = document.title
    if (title) document.title = title

    const created: HTMLElement[] = []

    function addMeta(attr: Record<string, string>) {
      const el = document.createElement('meta')
      Object.entries(attr).forEach(([k, v]) => el.setAttribute(k, v))
      document.head.appendChild(el)
      created.push(el)
    }

    if (description) addMeta({ name: 'description', content: description })
    metas.forEach(m => addMeta({ ...(m.name ? { name: m.name } : {}), ...(m.property ? { property: m.property } : {}), content: m.content }))

    let linkEl: HTMLLinkElement | null = null
    if (canonical) {
      linkEl = document.createElement('link')
      linkEl.setAttribute('rel', 'canonical')
      linkEl.setAttribute('href', canonical)
      document.head.appendChild(linkEl)
    }

    let jsonEl: HTMLScriptElement | null = null
    if (jsonLd) {
      jsonEl = document.createElement('script')
      jsonEl.type = 'application/ld+json'
      jsonEl.text = JSON.stringify(jsonLd)
      document.head.appendChild(jsonEl)
    }

    return () => {
      document.title = prevTitle
      created.forEach(el => document.head.removeChild(el))
      if (linkEl) document.head.removeChild(linkEl)
      if (jsonEl) document.head.removeChild(jsonEl)
    }
  }, [title, description, canonical, JSON.stringify(metas), JSON.stringify(jsonLd)])
}
