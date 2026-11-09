// =============================================================================
// FILE: src/domains/tax/gstin.ts — a GSTIN's checks, and a business buyer's at checkout (plan
// 2026-11-09-gst-core-and-categories § 2, § 5b items 8 and 12). Pure; safe in the browser (the checkout checks as you type).
// =============================================================================

import { STATE_CODE, STATES, type State } from '@/domains/checkout/states'

export const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

/** GSTIN: 15 characters; the last is a checksum (GSTN's mod-36 scheme). */
export function gstinValid(raw: string): boolean {
  const g = raw.toUpperCase()
  if (!GSTIN_SHAPE.test(g)) return false
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const p = chars.indexOf(g[i]!) * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(p / 36) + (p % 36)
  }
  return chars[(36 - (sum % 36)) % 36] === g[14]
}

/** The state a GSTIN is registered in, by name; null for a code that isn't a state. */
export function gstinStateName(gstin: string): State | null {
  const code = gstin.slice(0, 2)
  return STATES.find((s) => STATE_CODE[s] === code) ?? null
}

export const cleanGstin = (raw: string) => raw.toUpperCase().replace(/\s/g, '')

/**
 * Why a business buyer's details can't be used (null: they can). The GSTIN's state must be the delivery state: the
 * place of supply of goods is where delivery ends, and the GSTIN is registered there (a mismatch fails the return's
 * validation). No lookup of the legal name here: that comes from a GSP's registry only, never from past orders
 * (tenancy audit 2026-11-09).
 */
export function b2bProblem(gstin: string, name: string, deliveryState: string): { field: 'gstin' | 'name'; error: string } | null {
  const g = cleanGstin(gstin)
  if (!gstinValid(g)) return { field: 'gstin', error: 'A GSTIN is 15 characters, like 29ABCDE1234F1Z5, and its last character must match.' }
  const reg = gstinStateName(g)
  if (reg && deliveryState && reg !== deliveryState) return { field: 'gstin', error: `This GSTIN is registered in ${reg}. Use a ${reg} address, or turn this off.` }
  const n = name.trim()
  if (n.length < 2 || n.length > 120) return { field: 'name', error: 'The business name as registered.' }
  return null
}

/** The state a shop that doesn't charge GST (not registered, or composition) delivers within, by name (s.24). */
export const stateName = (code: string | null) => (code ? STATES.find((s) => STATE_CODE[s] === code) ?? null : null)

/** What checkout shows about GST: the state a shop without a regular GSTIN delivers within, and whether businesses may ask for a GST invoice. */
export function checkoutGst(s: { gstin: string | null; gstScheme: string; homeState: string | null; b2bInvoices: boolean; turnoverBand: string }) {
  const regular = !!s.gstin && s.gstScheme === 'regular'
  return { deliversWithin: regular ? null : stateName(s.gstin ? s.gstin.slice(0, 2) : s.homeState), b2b: regular && s.b2bInvoices && s.turnoverBand === 'under_5cr' }
}
