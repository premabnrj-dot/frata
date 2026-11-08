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

import type { Attribution } from './attribution'

/** Bumped whenever the rule changes; the page says so with the date (spec: numbers never jump without a word). */
export const CLASSIFIER_VERSION = 1
export const CLASSIFIER_SINCE = '2026-11-08'

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
  chat: 'chat', group: 'group', email: '', newsletter: '', organic: '', social: '', referral: '',
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
export const slugOf = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'unknown'

function make(channel: Channel, label: string, campaign: string | null): Source {
  return { channel, label, slug: slugOf(label), campaign: campaign ? campaign.slice(0, 200) : null }
}

/**
 * The order's source. `creator`: the label of the creator code the order uses now (useOfRowSql), or null.
 */
export function classifySource(a: Attribution, creator: string | null): Source {
  const campaign = a.utm_campaign ?? null
  if (creator) return make('creator', `Creator · ${creator}`, campaign)

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
    // A value the merchant (or someone) typed: kept as its own row under Other.
    return make('other', `Other · ${src.slice(0, 40)}`, campaign)
  }
  if (a.gclid || a.gbraid || a.wbraid || a.gad_source) return make('google_ads', 'Google ads', campaign)
  if (a.srsltid) return make('google', 'Google', campaign)
  if (a.fbclid) return make('meta', 'Instagram or Facebook', campaign)
  if (a.ref_host) {
    const host = a.ref_host.replace(/^www\./, '')
    const hit = HOST_CHANNEL.find(([re]) => re.test(host))
    if (hit) return make(hit[1], CHANNEL_LABEL[hit[1]], campaign)
    return make('website', host.slice(0, 60), campaign)
  }
  return make('direct', CHANNEL_LABEL.direct, campaign)
}
