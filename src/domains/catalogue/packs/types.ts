// =============================================================================
// FILE: src/domains/catalogue/packs/types.ts — WHAT A CATEGORY PACK IS (plan docs/plans/2026-11-23-c1-category-packs.md).
// A pack is pure data: everything Frrata derives from "this store sells X". A new category is one pack file, one line
// in list.ts and one generated migration (the CHECK); no reader changes (check:packs holds the shape).
// =============================================================================

import type { PresetKey } from '../size-charts'

/** One sentence of the returns page (policies/render.ts). A store that sells several packs gets each distinct line once, by rank. */
export type ReturnLine = { readonly rank: number; readonly text: string }

export type Pack = {
  /** The sell key in shop_settings.sells and its CHECK: /^[a-z][a-z_]{1,23}$/. Never renamed or removed, because stores hold it. */
  readonly key: string
  /** Sign-up and Settings › Store details: the words, the place in the grid, a 24×24 stroke path. */
  readonly tile: { readonly label: string; readonly order: number; readonly icon: string }
  /** shop_settings.default_hsn at sign-up: the pack with the lowest rank among those the store sells wins. A prefill, never a fallback. */
  readonly startingHsn: { readonly code: string; readonly rank: number }
  /** Clothing or footwear: the kind step, starting sizes, the size chart and model panels. */
  readonly sized: boolean
  /** Starting size charts (size-charts.ts PRESETS). Every store also gets one_size. */
  readonly charts: readonly PresetKey[]
  /** The editor asks what the pack says (label.ts), and Active needs it. */
  readonly label: boolean
  readonly returns: ReturnLine
  // Not declared yet (YAGNI); each arrives as an optional member, so no reader changes:
  //   noun?, photo? (C1d) · fields?, shipping?, taxonomy?, kindWords? (C2) · declarations?, rates? (C2 and C3)
}
