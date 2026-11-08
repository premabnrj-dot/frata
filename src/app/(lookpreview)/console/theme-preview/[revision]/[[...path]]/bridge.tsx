'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** Listens to the customizer (same origin only): refresh after a save; outline and scroll to a selected section.
 *  And answers it (2.0): a first click on a section selects it there (the customizer opens its settings); a click on
 *  the section already selected acts as on the shop (a link opens). Hovered sections are outlined. */
export function PreviewBridge() {
  const router = useRouter()
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return
      const m = e.data as { type?: string; sectionId?: string | null }
      if (m.type === 'refresh') router.refresh()
      if (m.type === 'select') {
        document.querySelectorAll('[data-picked]').forEach((n) => n.removeAttribute('data-picked'))
        const el = m.sectionId ? document.querySelector<HTMLElement>(`[data-section="${CSS.escape(m.sectionId)}"] > *`) : null
        if (el) { el.setAttribute('data-picked', ''); el.scrollIntoView({ block: 'center', behavior: 'smooth' }) }
      }
    }
    // Only inside the customizer's frame: opened on its own (Preview, a new tab) it is just the shop.
    const framed = window.parent !== window
    const click = (e: MouseEvent) => {
      const sec = (e.target as Element | null)?.closest<HTMLElement>('[data-section]')
      const id = sec?.getAttribute('data-section')
      if (!id || sec!.querySelector(':scope > [data-picked]')) return
      e.preventDefault(); e.stopPropagation()
      window.parent.postMessage({ type: 'picked', sectionId: id }, window.location.origin)
    }
    if (framed) { document.documentElement.setAttribute('data-inspect', ''); document.addEventListener('click', click, true) }
    window.addEventListener('message', on)
    window.parent?.postMessage({ type: 'ready' }, window.location.origin)
    return () => { window.removeEventListener('message', on); document.removeEventListener('click', click, true) }
  }, [router])
  return null
}
