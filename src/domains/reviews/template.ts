// =============================================================================
// FILE: src/domains/reviews/template.ts — the review ask as Meta stores it (Reviews R1 task 6b).
//
// A UTILITY template, created in the SHOP's own WhatsApp account (the merchant's number; Meta bills the merchant).
// Utility stays Utility only while it carries no offer and no promotion (H-utility in the plan): no coupon, no
// "shop again". Two buttons: a URL button that opens this order's review page, and a quick-reply Stop that puts the
// number on the shop's opt-out list (security review H3). Pure: the Graph client sends what this builds.
// =============================================================================

export const REVIEW_TEMPLATE = 'frrata_review_ask_v1'
export const REVIEW_TEMPLATE_LANG = 'en'
export const STOP_PAYLOAD = 'frrata_stop_v1'

/** The body, with its three parameters: the buyer's first name, the product, the shop. */
export const ASK_BODY = 'Hi {{1}}, how is your {{2}} from {{3}}? Tap below to tell other shoppers how it fits.'

/** What Meta is asked to create, for a shop at `host` (the link's base: the shop's own address). */
export function templateDefinition(host: string) {
  return {
    name: REVIEW_TEMPLATE, language: REVIEW_TEMPLATE_LANG, category: 'UTILITY', parameter_format: 'POSITIONAL',
    components: [
      { type: 'BODY', text: ASK_BODY, example: { body_text: [['Ananya', 'Chanderi kurta set', 'Kesar Studio']] } },
      { type: 'BUTTONS', buttons: [
        // The token travels as the URL's last segment; the page moves it into the fragment at once (task 8).
        { type: 'URL', text: 'Write a review', url: `https://${host}/review/{{1}}`, example: [`https://${host}/review/AbCdEf0123456789`] },
        { type: 'QUICK_REPLY', text: 'Stop' },
      ] },
    ],
  }
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** The send's components for one order: parameters cut to what reads well on a phone (Meta caps them anyway). */
export function askComponents(p: { firstName: string; product: string; shop: string; token: string }) {
  return [
    { type: 'body', parameters: [{ type: 'text', text: cut(p.firstName || 'there', 30) }, { type: 'text', text: cut(p.product, 60) }, { type: 'text', text: cut(p.shop, 40) }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: p.token }] },
    { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: STOP_PAYLOAD }] },
  ]
}

/** The first word of a typed name, capitalised ("ananya sharma" → "Ananya"). */
export const firstNameOf = (name: string) => { const w = name.trim().split(/\s+/)[0] ?? ''; return w ? w[0]!.toUpperCase() + w.slice(1) : '' }
