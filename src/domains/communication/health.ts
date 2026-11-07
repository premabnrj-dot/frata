// =============================================================================
// FILE: src/domains/communication/health.ts — what a connected number needs from the merchant, in words.
// (docs/specs/2026-11-07-communication.md § C1 · 4; mockup Health.) Facts in, items out; `now` passed in.
// Meta's raw values (quality GREEN/YELLOW/RED, name status, limit tier) never reach the page as they are.
// =============================================================================

export type HealthFacts = {
  displayPhone: string
  verifiedName: string | null
  coexistence: boolean
  quality: string | null
  limitTier: string | null
  nameStatus: string | null
  paymentOk: boolean | null
  currency: string | null
  tokenRejectedAt: Date | null
}

export type NeedKey = 'reconnect' | 'payment' | 'currency' | 'name_review' | 'name_declined' | 'quality'
export type Need = { key: NeedKey; tone: 'danger' | 'warn' | 'info'; badge: string; text: string; action: 'reconnect' | 'manager' | 'currency_help' | null; note?: string }

/** India accounts must bill in INR by 31 Dec 2026, or delivery stops on 1 Jan 2027 (frata-integrations, checked 2026-11-07). */
export const INR_DEADLINE = new Date('2027-01-01T00:00:00+05:30')
export const WA_MANAGER = 'https://business.facebook.com/wa/manage/home/'

/** Worst first: what blocks messages, then what will, then what is only in review. */
export function needsFor(f: HealthFacts, now: Date): Need[] {
  const out: Need[] = []
  if (f.tokenRejectedAt) out.push({ key: 'reconnect', tone: 'danger', badge: 'Blocks messages', text: 'Frrata can no longer reach this number', action: 'reconnect' })
  if (f.paymentOk === false) out.push({ key: 'payment', tone: 'danger', badge: 'Blocks messages', text: 'Add a payment method in WhatsApp Manager', action: 'manager' })
  if (f.currency && f.currency.toUpperCase() !== 'INR') {
    const late = now.getTime() >= INR_DEADLINE.getTime()
    out.push({ key: 'currency', tone: late ? 'danger' : 'warn', badge: late ? 'Blocks messages' : 'By 31 Dec', text: 'Move WhatsApp billing to INR', action: 'currency_help' })
  }
  const q = f.quality?.toUpperCase()
  if (q === 'RED') out.push({ key: 'quality', tone: 'warn', badge: 'Quality low', text: 'Fewer messages are being sent. Shoppers blocked or reported recent ones.', action: null })
  const n = f.nameStatus?.toUpperCase()
  if (n === 'DECLINED' || n === 'REJECTED') out.push({ key: 'name_declined', tone: 'warn', badge: 'Declined', text: `Display name ${f.verifiedName ? `"${f.verifiedName}"` : ''}`.trim(), action: 'manager' })
  else if (n === 'PENDING_REVIEW' || n === 'PENDING') out.push({ key: 'name_review', tone: 'info', badge: 'In review', text: `Display name ${f.verifiedName ? `"${f.verifiedName}"` : ''}`.trim(), action: null, note: 'Meta, up to 24 h' })
  return out
}

const TIERS: Record<string, string> = {
  TIER_50: '50', TIER_250: '250', TIER_1K: '1,000', TIER_2K: '2,000', TIER_10K: '10,000', TIER_100K: '1,00,000', TIER_UNLIMITED: 'Unlimited',
}
/** "250" new chats a day, or null when Meta has not said. */
export const limitWords = (tier: string | null): string | null => (tier ? TIERS[tier.toUpperCase()] ?? null : null)

const QUALITY: Record<string, string> = { GREEN: 'High', YELLOW: 'Medium', RED: 'Low' }
export const qualityWords = (q: string | null): string => (q ? QUALITY[q.toUpperCase()] ?? 'Not rated yet' : 'Not rated yet')

/** The one word for the page header and the Apps row. */
export const connectionState = (needs: Need[]): 'connected' | 'attention' => (needs.length ? 'attention' : 'connected')
