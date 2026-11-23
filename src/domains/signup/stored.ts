// =============================================================================
// FILE: src/domains/signup/stored.ts
//
// WHAT SIGN-UP KEEPS IN sessionStorage (O1·9; plan § Rules: never the URL, never localStorage): the name, its address,
// whether the address was edited, and when the person first arrived. What comes back is checked as if a stranger wrote
// it (security review 2026-11-23): a name is a string of at most 60, an address passes slugProblem, the arrival is a
// finite time not after now — anything else is dropped. It is only ever rendered as text. Pure.
// =============================================================================

import { slugProblem } from './slug'

export const STORE_KEY = 'frrata:signup'
export type StoredSignup = { name: string; slug: string; slugEdited: boolean; arrivedAt: number | null }

export function readStoredSignup(raw: string | null, now: number): StoredSignup | null {
  if (!raw) return null
  let v: unknown
  try { v = JSON.parse(raw) } catch { return null }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const name = typeof o.name === 'string' && o.name.length <= 60 ? o.name : ''
  const slug = typeof o.slug === 'string' && !slugProblem(o.slug) ? o.slug : ''
  const arrivedAt = typeof o.arrivedAt === 'number' && Number.isFinite(o.arrivedAt) && o.arrivedAt <= now ? o.arrivedAt : null
  return { name, slug, slugEdited: !!slug && o.slugEdited === true, arrivedAt }
}
