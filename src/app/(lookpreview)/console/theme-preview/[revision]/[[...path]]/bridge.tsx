'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** Listens to the customizer (same origin only): refresh after a save; outline and scroll to a selected section. */
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
    window.addEventListener('message', on)
    window.parent?.postMessage({ type: 'ready' }, window.location.origin)
    return () => window.removeEventListener('message', on)
  }, [router])
  return null
}
