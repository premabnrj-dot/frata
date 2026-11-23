// =============================================================================
// FILE: src/domains/settings/fields.ts — A SETUP POPUP'S FIELDS (plan 2026-11-23-o2a-setup-card O2a·2)
//
// Saving part of a settings section without blanking the rest: the subsets a popup may save (SETUP_FIELDS) and the
// parser (parseFields). Apart from sections.ts, which the Settings pages' browser code imports, so this never rides
// into their script. Pure.
// =============================================================================

import { check, formValues, type Patch, type Section, type SectionKey, type Values } from './sections'

/**
 * THE SETUP POPUPS' FIELDS (plan 2026-11-23-o2a-setup-card O2a·2): the only subsets a popup may save, by popup and
 * section, chosen on the server and never from the client. `gstRegistration` is the Registration choice, not a column.
 */
export const SETUP_FIELDS = {
  details: { business: ['legalName', 'gstRegistration', 'homeState', 'gstin'], contact: ['grievanceName', 'grievancePhone', 'grievanceEmail'] },
  payments: { payments: ['codOn', 'codMax'] },
  pickup: { store: ['pickupPincode'] },
} as const satisfies Record<string, Partial<Record<SectionKey, readonly string[]>>>
export type SetupPopup = keyof typeof SETUP_FIELDS

export type FieldsResult = { ok: true; patch: Patch } | { ok: false; errors: Record<string, string> } | { ok: false; stale: string[] }

/**
 * A part of a section, saved without blanking the rest (O2a·2). Only `keys` that are in `values` overlay the stored
 * values; a field the popup leaves out keeps what is stored (`Object.hasOwn`, so a left-out GSTIN or grievance email
 * is never blanked). The section is then checked whole, so a cross-field rule sees the stored values (the lowest
 * Pay on delivery order against a typed highest, the GSTIN's state). The patch holds only the keys sent, plus the
 * columns the Registration choice derives (taxesPatch). An error on a field of the subset goes back by field; one on a
 * field outside it (a stored value that the typed one no longer agrees with) is `stale`, for the popup to send the
 * person to the page that holds it. Locks (lockedFor, NEEDED_WHEN_OPEN, HELD_BY_ZONES) and the version are the save's.
 */
export function parseFields(section: Section, keys: readonly string[], values: Values, stored: Record<string, unknown>): FieldsResult {
  const sent = keys.filter((k) => Object.hasOwn(values, k))
  const merged: Values = { ...formValues(section, stored) }
  for (const k of sent) merged[k] = values[k]!
  const { patch, errors } = check(section, merged)
  const bad = Object.keys(errors)
  if (bad.length) {
    const mine = bad.filter((k) => keys.includes(k))
    return mine.length ? { ok: false, errors: Object.fromEntries(mine.map((k) => [k, errors[k]!])) } : { ok: false, stale: bad }
  }
  const out: Patch = {}
  for (const k of sent) if (Object.hasOwn(patch, k)) out[k] = patch[k]!
  if (section.key === 'business' && sent.includes('gstRegistration')) {
    const reg = String(merged.gstRegistration)
    out.gstScheme = patch.gstScheme!
    if (patch.homeState != null) out.homeState = patch.homeState
    if (reg === 'none') out.gstin = null
    if (reg === 'composition') { out.pricesIncludeGst = true; out.b2bInvoices = false }
    if (reg === 'regular' && patch.b2bInvoices === false && stored.b2bInvoices !== false) out.b2bInvoices = false
  }
  return { ok: true, patch: out }
}

