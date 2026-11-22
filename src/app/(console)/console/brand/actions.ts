'use server'

import { CAN_BUILD, requireMember } from '@/lib/auth/require-member'
import { decideBrand, saveBrand, saveCheckout, undoBrand, undoCheckout, type BrandResult } from '@/lib/content/save'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { storeSvgLogo } from '@/lib/media/brand-files'
import { BRAND_REFUSAL } from '@/domains/brand/who'

// =============================================================================
// Console › Brand (one-address plan P1·8; owner-approved mockup docs/mockups/2026-11-16-p1-brand.html). Every write is
// saveBrand, decideBrand or undoBrand (src/lib/content/save.ts): who may save, when a save waits for the owner, the
// checks, the audit row and the purge live there, once.
// =============================================================================

export async function saveBrandAction(input: unknown): Promise<BrandResult> { return saveBrand(input) }
export async function decideBrandAction(input: unknown): Promise<BrandResult> { return decideBrand(input) }
export async function undoBrandAction(input: unknown): Promise<BrandResult> { return undoBrand(input) }
// Console › Brand › Checkout (one-address P2·6): the checkout design, through the same door (decideBrand answers either kind).
export async function saveCheckoutAction(input: unknown): Promise<BrandResult> { return saveCheckout(input) }
export async function undoCheckoutAction(input: unknown): Promise<BrandResult> { return undoCheckout(input) }

/**
 * An SVG logo: its text comes here (the browser's upload token takes photos only), is cleaned and stored under its own
 * hash; the page then saves its URL through saveBrandAction. Refused at the slot in the cleaner's words.
 */
export async function uploadSvgLogoAction(text: unknown): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const me = await requireMember(CAN_BUILD)
  if (!me.ok) return { ok: false, error: me.message }
  if (me.membership.supportSessionId) return { ok: false, error: BRAND_REFUSAL.support }
  if (typeof text !== 'string' || text.length > 200 * 1024) return { ok: false, error: 'This SVG is over 200 kB. Upload a smaller one.' }
  if (!(await withinLimit(LIMITS.brandSvg, me.membership.tenantId, new Date(), true))) return { ok: false, error: 'Too many uploads. Try again in 10 minutes.' }
  return storeSvgLogo(me.membership.tenantId, text)
}
