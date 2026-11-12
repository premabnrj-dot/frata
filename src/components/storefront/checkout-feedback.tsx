'use client'

import { useEffect, useRef } from 'react'
import type { ToastApi } from '@/components/ui/toast-context'

// =============================================================================
// FILE: src/components/storefront/checkout-feedback.tsx — how the checkout speaks through the shop's toast
// (frata-design-language § Feedback): a bag that could not be priced, and the pay bar the toast keeps clear of. The
// field summary is checkout-summary.tsx (its own chunk: it is needed only after a submit with mistakes).
// =============================================================================

/** The bag could not be priced (no connection, a refusal): a failure, said as an error toast with Try again; it leaves
 *  once a price arrives. */
export function useQuoteToast(toast: ToastApi, error: string | null, refresh: () => Promise<unknown>) {
  const shown = useRef<number | null>(null)
  useEffect(() => {
    if (!error) { if (shown.current !== null) { toast.dismiss(shown.current); shown.current = null } return }
    shown.current = toast.next()
    toast.error(error, { action: { label: 'Try again', keep: true, run: async () => { await refresh() } } })
  }, [error]) // eslint-disable-line react-hooks/exhaustive-deps -- the toast API is stable; refresh follows the bag
}

/** The fixed pay bar. It tells the shop's toast its height (`--store-bar`), so a toast sits above it, never over Pay. */
export function PayBar({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current, root = document.documentElement
    if (!el) return
    const lift = () => root.style.setProperty('--store-bar', `${el.offsetHeight + 12}px`)
    lift()
    const ro = new ResizeObserver(lift); ro.observe(el)
    return () => { ro.disconnect(); root.style.removeProperty('--store-bar') }
  }, [])
  return <div ref={ref} className="fixed inset-x-0 bottom-0 z-20 border-t border-store-line bg-store-paper px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 shadow-store-bar">{children}</div>
}
