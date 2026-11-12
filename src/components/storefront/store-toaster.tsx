// =============================================================================
// FILE: src/components/storefront/store-toaster.tsx — WHERE THE SHOP'S TOAST IS DRAWN (frata-design-language
// § Feedback, F3). Server markup only, no script: an empty box the toast is drawn into and the shop's own polite live
// region, both inside [data-store-theme] (the shop's tokens). ShopShell renders it on the real shop only; the
// console's preview has none, so a toast raised there does nothing (store-toast.ts).
//
// Why no client Toaster in the shell: every shop page would pay for it, and the pages without an island (About, FAQ)
// had 0.1 kB of their 113 kB left (F3 build, 2026-11-12). The islands that speak (checkout, order page, drops) carry
// the small store-toast.ts; the toast itself (store-toast-view.tsx) loads after the page, in its own chunk.
// =============================================================================

export const TOAST_BOX = 'store-toast'
export const TOAST_SAY = 'store-toast-say'

export function StoreToaster({ tabs = false }: {
  /** The shop shows its bottom tabs on phones: the toast sits above them. */
  tabs?: boolean }) {
  return (
    <>
      <div id={TOAST_BOX} className={tabs ? 'max-sm:[--store-tabs:3.5rem]' : undefined} />
      <div id={TOAST_SAY} aria-live="polite" aria-atomic="true" className="sr-only" />
    </>
  )
}
