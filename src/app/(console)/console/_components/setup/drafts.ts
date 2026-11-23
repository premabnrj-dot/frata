// =============================================================================
// FILE: src/app/(console)/console/_components/setup/drafts.ts
//
// What each setup popup holds while it is open AND after it closes (plan 2026-11-23-o2a-setup-card O2a·7: values
// survive ✕, Esc, Back and the backdrop, and reset only after a save or a reload). The island (setup-actions.tsx) owns
// them; each popup, loaded with next/dynamic, reads and writes its own. Types and empty values only.
// =============================================================================

import type { SetupStepKey } from '@/domains/setup/checklist'
import type { Values } from '@/domains/settings/sections'

/** A step as the card draws it: `mine` when this person may act on it (a row they may not is text). */
export type StepView = { key: SetupStepKey; title: string; action: string; value: string; done: boolean; mine: boolean }

export type Photo = { base: string; widths: number[]; width: number; height: number }
/** `sizes` null: none chosen by hand yet, so the pills follow the name (firstProductShape's pressed). */
export type ProductDraft = { title: string; price: string; stock: string; sizes: string[] | null; photo: Photo | null }
/** A settings popup's values as its form draws them, and the version its save carries; null until it first opens. */
export type FieldsDraft = { values: Values; version: number; locked: boolean; held: boolean; view: 1 | 2 } | null

export type Drafts = { product: ProductDraft; details: FieldsDraft; payments: FieldsDraft }
export const EMPTY_PRODUCT: ProductDraft = { title: '', price: '', stock: '', sizes: null, photo: null }
export const EMPTY: Drafts = { product: EMPTY_PRODUCT, details: null, payments: null }

/** What a popup is told by the island. */
export type PopupProps<D> = { open: boolean; draft: D; setDraft: (d: D) => void; onClose: () => void; onSaved: (toast: string) => void }
