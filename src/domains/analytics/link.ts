// =============================================================================
// FILE: src/domains/analytics/link.ts
//
// MAKE A LINK (Analytics A·1, spec § Design 6; security review LOW-6): the ONE builder of a shop link with tags, used
// by Analytics' Make a link and by Offers' creator links. Built with URL and URLSearchParams, never by joining
// strings, so a name like "x&code=RIYA10" cannot add a creator's code; the result's origin is always the shop's own.
// Presets write lowercase tags with one separator (a typo would split a row); the merchant names only the campaign.
// Pure.
// =============================================================================

export const PRESETS = {
  instagram_bio: { label: 'Instagram bio', source: 'instagram', medium: 'bio' },
  instagram_story: { label: 'An Instagram story', source: 'instagram', medium: 'story' },
  whatsapp_broadcast: { label: 'A WhatsApp broadcast', source: 'whatsapp', medium: 'broadcast' },
  meta_ad: { label: 'An Instagram or Facebook ad', source: 'meta', medium: 'paid_social' },
  google_ad: { label: 'A Google ad', source: 'google', medium: 'cpc' },
} as const
export type Preset = keyof typeof PRESETS
/** The console's Share button (search and sharing S1·7): kept apart, so Make a link's list stays as it is. */
export const SHARE_PRESETS = {
  share_whatsapp: { label: 'WhatsApp', source: 'whatsapp', medium: 'share' },
  share_instagram: { label: 'Instagram', source: 'instagram', medium: 'share' },
  share_facebook: { label: 'Facebook', source: 'facebook', medium: 'share' },
  share_copy: { label: 'Copy link', source: 'share', medium: 'link' },
  share_qr: { label: 'QR code', source: 'qr', medium: 'print' },
} as const
export type SharePreset = keyof typeof SHARE_PRESETS

/** A campaign name as a tag: lowercase letters, digits and hyphens, 1–50. Null when nothing usable is left. */
export function campaignTag(name: string): string | null {
  const t = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '')
  return t || null
}

/** A shop path we link to: one leading slash, letters, digits, hyphens and slashes only (a product or collection). */
const PATH = /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/

/**
 * The link. `origin`: the shop's own address from the server (https://kesar.frrata.in). `path`: '/', '/products/<h>'
 * or '/collections/<h>' from the server's own lists. Throws on anything else: a link to another site is never made.
 */
export function shopLink(origin: string, path: string, tags: { preset?: Preset | SharePreset; campaign?: string | null; code?: string | null }): string {
  const base = new URL(origin)
  if (base.protocol !== 'https:' && base.protocol !== 'http:') throw new Error('not a shop origin')
  if (!PATH.test(path)) throw new Error('not a shop path')
  const u = new URL(path, base.origin)
  if (u.origin !== base.origin) throw new Error('not the shop')
  if (tags.preset) {
    const p = tags.preset in PRESETS ? PRESETS[tags.preset as Preset] : SHARE_PRESETS[tags.preset as SharePreset]
    u.searchParams.set('utm_source', p.source)
    u.searchParams.set('utm_medium', p.medium)
  }
  const c = tags.campaign ? campaignTag(tags.campaign) : null
  if (c) u.searchParams.set('utm_campaign', c)
  if (tags.code) u.searchParams.set('code', tags.code)
  return u.toString()
}
