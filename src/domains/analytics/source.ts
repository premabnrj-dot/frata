// =============================================================================
// FILE: src/domains/analytics/source.ts
//
// WHERE AN ORDER CAME FROM: the ONE rule (Analytics A·1, spec § Design 7; plan review 7). Classified on read from the
// raw attribution the order keeps (attribution.ts), so a better rule re-reads history. The evidence, strongest first:
// a creator's code > the link's own tags (utm) > a Google ads click (gclid, gbraid, wbraid, gad_source) > a Google free
// listing (srsltid) > a Meta click id (fbclid: "Instagram or Facebook", never an ad by itself, since Meta adds it to
// ordinary link taps too) > the referring site (a hint: in-app browsers often send none) > "Direct or unknown".
// Facts: frata-integrations § Attribution signals (checked 2026-11-08). Pure.
// =============================================================================

import { cleanValue, type Attribution } from './attribution'

/** Bumped whenever the rule changes; the page says so with the date (spec: numbers never jump without a word). */
export const CLASSIFIER_VERSION = 1
export const CLASSIFIER_SINCE = '2026-11-08'

/** The click ids that decide a source, by what they mean: SQL readers test these same lists (attribution-sql.ts). */
export const GOOGLE_ADS_KEYS = ['gclid', 'gbraid', 'wbraid', 'gad_source'] as const
export const GOOGLE_FREE_KEYS = ['srsltid'] as const
export const META_CLICK_KEYS = ['fbclid'] as const

export const CHANNELS = ['creator', 'instagram', 'facebook', 'meta', 'whatsapp', 'google_ads', 'google', 'youtube', 'email', 'website', 'other', 'direct'] as const
export type Channel = (typeof CHANNELS)[number]

/** How a channel is said (the merchant's words). */
export const CHANNEL_LABEL: Record<Channel, string> = {
  creator: 'Creator', instagram: 'Instagram', facebook: 'Facebook', meta: 'Instagram or Facebook', whatsapp: 'WhatsApp',
  google_ads: 'Google ads', google: 'Google', youtube: 'YouTube', email: 'Email', website: 'Another website', other: 'Other',
  direct: 'Direct or unknown',
}

export type Source = {
  channel: Channel
  /** The row's name: "Instagram bio", "Creator · Riya", "Google ads", "Other · newsletter-x". */
  label: string
  /** The source page's address segment: classifier output only, `[a-z0-9-]{1,64}`. */
  slug: string
  /** The link's campaign (utm_campaign), as typed, or null. */
  campaign: string | null
}

/** What a utm_source says, by its usual spellings (lowercase, one separator; presets in link.ts write these). */
const UTM_SOURCE: Record<string, Channel> = {
  instagram: 'instagram', ig: 'instagram', facebook: 'facebook', fb: 'facebook', meta: 'meta',
  whatsapp: 'whatsapp', wa: 'whatsapp', google: 'google', youtube: 'youtube', yt: 'youtube', email: 'email', newsletter: 'email',
}
/** Media that mean "paid": with Google they make Google ads; with Instagram, Facebook or Meta, "… ads". */
const PAID = new Set(['cpc', 'ppc', 'paid', 'paid_social', 'paidsocial', 'ad', 'ads', 'paid-social'])

/** How a medium is said after its channel ("Instagram bio", "WhatsApp broadcast"). */
const MEDIUM_WORD: Record<string, string> = {
  bio: 'bio', story: 'story', stories: 'story', reel: 'reel', post: 'post', dm: 'DM', broadcast: 'broadcast', status: 'status',
  chat: 'chat', group: 'group', share: 'share', email: '', newsletter: '', organic: '', social: '', referral: '',
}

/** Referring sites by their host (GA4's source list and the in-app shims; www. ignored). */
const HOST_CHANNEL: [RegExp, Channel][] = [
  [/(^|\.)instagram\.com$|^ig$/, 'instagram'],
  [/(^|\.)(facebook\.com|fb\.com|messenger\.com)$/, 'facebook'],
  [/(^|\.)(whatsapp\.com|wa\.me)$|^com\.whatsapp$/, 'whatsapp'],
  [/(^|\.)youtube\.com$|^youtu\.be$|^com\.google\.android\.youtube$/, 'youtube'],
  [/(^|\.)google\.[a-z.]+$|^com\.google\.android\.googlequicksearchbox$/, 'google'],
  [/^com\.instagram\.android$/, 'instagram'],
  [/^com\.facebook\.(katana|orca)$/, 'facebook'],
]

const tidy = (s: string) => s.toLowerCase().trim()
/** A short, stable hash, so two labels that lose their letters to the ASCII slug (Devanagari, say) stay apart. */
const hash = (s: string) => { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619) } return (h >>> 0).toString(36).slice(0, 6) }
/** A label as a URL segment, `[a-z0-9-]{1,64}`; a hash is added whenever letters were dropped. */
export function slugOf(s: string): string {
  const ascii = s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  // Letters or digits outside ASCII (once accents are dropped) would vanish from the slug; punctuation does not count.
  const lossy = /[^\x00-\x7f]/.test(s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]/gu, ''))
  return (lossy ? `${ascii.slice(0, 56) || 'x'}-${hash(s)}` : ascii.slice(0, 64)) || 'unknown'
}

function make(channel: Channel, label: string, campaign: string | null, slug = slugOf(label)): Source {
  return { channel, label, slug, campaign: campaign ? campaign.slice(0, 200) : null }
}

/**
 * The order's source. `creator`: the creator code the order uses now (useOfRowSql), its label and code, or null. A
 * creator's slug is built from the code (ASCII, one per shop), so creators with names in any script stay apart.
 */
export function classifySource(a: Attribution, creator: { label: string; code: string } | null): Source {
  const campaign = a.utm_campaign ?? null
  if (creator) return make('creator', `Creator · ${creator.label}`, campaign, `creator-${creator.code.toLowerCase().replace(/[^a-z0-9]/g, '')}`)

  const src = a.utm_source ? tidy(a.utm_source) : ''
  const med = a.utm_medium ? tidy(a.utm_medium) : ''
  if (src) {
    const ch = UTM_SOURCE[src]
    const paid = PAID.has(med)
    if (ch === 'google') return make(paid ? 'google_ads' : 'google', paid ? 'Google ads' : 'Google', campaign)
    if (ch === 'instagram' || ch === 'facebook' || ch === 'meta') {
      if (paid) return make('meta', `${ch === 'meta' ? 'Instagram or Facebook' : CHANNEL_LABEL[ch]} ads`, campaign)
      const word = MEDIUM_WORD[med] ?? med
      return make(ch, word ? `${CHANNEL_LABEL[ch]} ${word}` : CHANNEL_LABEL[ch], campaign)
    }
    if (ch) {
      const word = MEDIUM_WORD[med] ?? med
      return make(ch, word ? `${CHANNEL_LABEL[ch]} ${word}` : CHANNEL_LABEL[ch], campaign)
    }
    // The console's Share button (link.ts SHARE_PRESETS): its copied link and its printed QR code read as such.
    if (src === 'share') return make('other', 'Shared link', campaign)
    if (src === 'qr') return make('other', 'QR code', campaign)
    // A value the merchant (or someone) typed: kept as its own row under Other.
    return make('other', `Other · ${src.slice(0, 40)}`, campaign)
  }
  if (GOOGLE_ADS_KEYS.some((k) => a[k])) return make('google_ads', 'Google ads', campaign)
  if (GOOGLE_FREE_KEYS.some((k) => a[k])) return make('google', 'Google', campaign)
  if (META_CLICK_KEYS.some((k) => a[k])) return make('meta', 'Instagram or Facebook', campaign)
  if (a.ref_host) {
    const host = a.ref_host.replace(/^www\./, '')
    const hit = HOST_CHANNEL.find(([re]) => re.test(host))
    if (hit) return make(hit[1], CHANNEL_LABEL[hit[1]], campaign)
    return make('website', host.slice(0, 60), campaign)
  }
  return make('direct', CHANNEL_LABEL.direct, campaign)
}

/** What a SQL reader groups an order by (attribution-sql.ts): the tags, the referrer, which click ids it has, and the
 * creator code it uses. Every reader of stored orders (Analytics, a source's page, the order page) classifies these
 * through sourceOfInputs, so they always agree; each string is cleaned again here (rows from before the cleaner). */
export type SourceInputs = {
  us: string | null; um: string | null; uc: string | null; rh: string | null
  gads: boolean; srs: boolean; fb: boolean
  cl: string | null; cc: string | null
}

export function sourceOfInputs(r: SourceInputs): Source {
  const v = (x: string | null) => cleanValue(x) ?? undefined
  const label = cleanValue(r.cl), code = cleanValue(r.cc)
  return classifySource({
    utm_source: v(r.us), utm_medium: v(r.um), utm_campaign: v(r.uc), ref_host: v(r.rh),
    gclid: r.gads ? '1' : undefined, srsltid: r.srs ? '1' : undefined, fbclid: r.fb ? '1' : undefined,
  }, label && code ? { label, code } : null)
}
