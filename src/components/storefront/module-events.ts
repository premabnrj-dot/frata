import { useEffect } from 'react'

// =============================================================================
// FILE: src/components/storefront/module-events.ts — how a module talks to the checkout without core importing it
// (frata-architecture § Modules; EkCode P1): a module fills the form with a 'shop:prefill' event, hears the placed
// order's address with 'shop:placed', and names the arm it showed in sessionStorage 'shop:arm:<module>'.
// =============================================================================

/** Fills the form from 'shop:prefill' (only known fields, only non-empty strings). */
export function usePrefill<F extends Record<string, string>>(empty: F, set: (fn: (x: F) => F) => void) {
  useEffect(() => {
    const fill = (e: Event) => {
      const d = (e as CustomEvent<Partial<F>>).detail
      set((x) => ({ ...x, ...Object.fromEntries(Object.entries(d ?? {}).filter(([k, v]) => k in empty && typeof v === 'string' && v)) }))
    }
    window.addEventListener('shop:prefill', fill)
    return () => window.removeEventListener('shop:prefill', fill)
  }, [empty, set])
}

/** Tells modules the order was placed, with the address it went to. */
export const announcePlaced = (address: Record<string, string>) => window.dispatchEvent(new CustomEvent('shop:placed', { detail: address }))

/** The arm a module showed this visit ('shown' | 'held'), for the order's facts; anything else is dropped. */
export function moduleArm(module: string): 'shown' | 'held' | null {
  try { const v = sessionStorage.getItem(`shop:arm:${module}`); return v === 'shown' || v === 'held' ? v : null } catch { return null }
}
