import { useEffect } from 'react'

type Meta = { name?: string; property?: string; content: string }

export function useHead({
  title,
  description,
  canonical,
  metas = [],
  jsonLd,
}: {
  title?: string
  description?: string
  canonical?: string
  metas?: Meta[]
  jsonLd?: object | object[]        // allow single or array of JSON-LD blocks
}) {
  useEffect(() => {
    const prevTitle = document.title
    if (title) document.title = title

    const created: HTMLElement[] = []

    const addMeta = (attr: Record<string, string>) => {
      const el = document.createElement('meta')
      Object.entries(attr).forEach(([k, v]) => el.setAttribute(k, v))
      document.head.appendChild(el)
      created.push(el)
    }

    if (description) addMeta({ name: 'description', content: description })
    metas.forEach(m =>
      addMeta({
        ...(m.name ? { name: m.name } : {}),
        ...(m.property ? { property: m.property } : {}),
        content: m.content,
      })
    )

    let linkEl: HTMLLinkElement | null = null
    if (canonical) {
      linkEl = document.createElement('link')
      linkEl.rel = 'canonical'
      linkEl.href = canonical
      document.head.appendChild(linkEl)
    }

    const jsonBlocks: HTMLScriptElement[] = []
    if (jsonLd) {
      const list = Array.isArray(jsonLd) ? jsonLd : [jsonLd]
      for (const block of list) {
        const el = document.createElement('script')
        el.type = 'application/ld+json'
        el.text = JSON.stringify(block)
        document.head.appendChild(el)
        jsonBlocks.push(el)
      }
    }

    return () => {
      document.title = prevTitle
      created.forEach(el => document.head.removeChild(el))
      if (linkEl) document.head.removeChild(linkEl)
      jsonBlocks.forEach(el => document.head.removeChild(el))
    }
  }, [title, description, canonical, JSON.stringify(metas), JSON.stringify(jsonLd)])
}
