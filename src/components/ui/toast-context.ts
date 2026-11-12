import { createContext, useContext } from 'react'

// =============================================================================
// FILE: src/components/ui/toast-context.ts — the toast's API and context, apart from the console's <Toaster>
// (src/components/ui/toast.tsx). The shop's own toast (src/components/storefront/store-toast.ts) implements this API,
// and field-error.tsx reads the context from here, so neither pulls the console's Toaster into a shop page's script
// (a "use client" module ships whole: through toast.tsx it cost a shop page about 2.5 kB gzipped, F3 build 2026-11-12).
// =============================================================================

export type ToastAction = { label: string; run: () => void | Promise<void>; /** Stay after it runs (the field summary's Show). */ keep?: boolean }
export type ToastUndo = () => Promise<{ ok: boolean; error?: string }>
type Show = (t: { text: string; undo?: ToastUndo }) => void
export type ToastApi = Show & {
  ok: (text: string, o?: { undo?: ToastUndo; sub?: string }) => void
  error: (text: string, o?: { sub?: string; action?: ToastAction; quiet?: boolean }) => void
  /** Replaces the text of the toast on screen if it is still `id` (the field-error summary counting down). */
  update: (id: number, text: string) => void
  /** Closes the toast on screen if it is still `id` (or any, without an id). */
  dismiss: (id?: number) => void
  /** The id the NEXT toast will get (so a caller can update or dismiss what it showed). */
  next: () => number
}

export const ToastContext = createContext<ToastApi | null>(null)

/** `toast({ text, undo })`, `toast.ok(...)`, `toast.error(...)` from anywhere inside a Toaster. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast outside <Toaster>')
  return api
}
