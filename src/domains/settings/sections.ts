// =============================================================================
// FILE: src/domains/settings/sections.ts
//
// THE SETTINGS PAGES AS DATA: each section's fields, words and checks, read by
// the console form (to draw and check as you type) and by the save action (to
// check again on the server). One definition, so the two can never disagree.
// Pure: field keys are shop_settings columns (camelCase) or the shop name.
// Money fields are typed in rupees and stored in paise (ADR-0004).
// =============================================================================

import { EMAIL_SHAPE, PINCODE_SHAPE } from '../signup/slug'
import { seriesFits } from '../orders/work'
import { CAN_BUILD, type MemberRole } from '../tenancy/roles'
import { STATE_CODE } from '../checkout/states'

export type FieldKind = 'text' | 'textarea' | 'email' | 'phone' | 'rupees' | 'days' | 'select' | 'switch' | 'gstin' | 'hsn' | 'pincodes' | 'radio' | 'segmented' | 'state'

export type Field = {
  key: string
  label: string
  kind: FieldKind
  /** One visible line, ONLY for a limit the person must meet, money, or legal/GST wording (design-language § Labels, info tips). */
  hint?: string
  /** Optional detail behind an (i): a definition, why we ask, what happens later, an example. */
  tip?: string
  required?: boolean
  max?: number
  options?: readonly (readonly [string, string])[]
  wide?: boolean
  /** Printed on documents: refuse web addresses (a PDF viewer would make them links). */
  noLinks?: boolean
  /** Radio cards: the second line under each option (its consequence, in a few words). */
  notes?: Record<string, string>
  /** Shown (and checked, and saved) only while another field holds one of these values. */
  showIf?: { key: string; in: readonly string[] }
}

export type Block = { title: string; hint?: string; tip?: string; fields: Field[] }

export type SectionKey = 'store' | 'contact' | 'brand' | 'policies' | 'payments' | 'shipping' | 'taxes' | 'documents'

/**
 * `editors`: who may open and save this section (tenancy audit 2026-11-07). Required, so a new section decides
 * it on purpose: a section that holds keys, people or money a partner must not touch says CAN_MANAGE or ['owner'].
 */
export type Section = { key: SectionKey; title: string; intro: string; blocks: Block[]; preview: 'footer' | 'contact' | 'brand' | 'policy' | 'checkout' | 'invoice'; editors: readonly MemberRole[] }

export const REGISTRATION_OPTIONS = [['regular', 'Regular'], ['composition', 'Composition'], ['none', 'Not registered']] as const
export const TURNOVER_OPTIONS = [['under_5cr', 'Under ₹5 crore'], ['5_to_10cr', '₹5–10 crore'], ['over_10cr', '₹10 crore or more']] as const
export const FILING_OPTIONS = [['monthly', 'Monthly'], ['quarterly', 'Quarterly (IFF)']] as const
export const LANGUAGE_OPTIONS = [['en', 'English'], ['hi', 'हिन्दी (Hindi)']] as const
export const RETURN_OPTIONS = [['exchange_or_refund', 'An exchange or a refund'], ['exchange_only', 'An exchange only'], ['refund_only', 'A refund only'], ['none', 'No returns']] as const
export const SLIP_SIZE_OPTIONS = [['a4', 'A4 paper'], ['label', '4×6 label (thermal printer)']] as const
export const RETURN_DAY_OPTIONS = [['3', '3 days'], ['7', '7 days'], ['10', '10 days'], ['15', '15 days'], ['30', '30 days']] as const

const LAW = 'Shown on your shop’s Contact page and footer, as the Consumer Protection (E-Commerce) Rules ask.'

export const SECTIONS: readonly Section[] = [
  {
    editors: CAN_BUILD,
    key: 'store', title: 'Store details', intro: 'Your shop’s name and the business behind it.', preview: 'footer',
    blocks: [
      { title: 'Your shop', fields: [
        { key: 'name', label: 'Shop name', kind: 'text', required: true, max: 60 },
        { key: 'orderPrefix', label: 'Order number prefix', kind: 'text', max: 4, tip: 'Orders read KS-1043. Left empty, two letters of your shop’s name.' },
      ] },
      { title: 'Your business', hint: LAW, fields: [
        { key: 'legalName', label: 'Legal business name', kind: 'text', max: 120, tip: 'As registered: a sole proprietor’s name, an LLP or a company.' },
        { key: 'originCountry', label: 'Country of origin, for products', kind: 'text', max: 40, tip: 'Each product can say otherwise.' },
        { key: 'address', label: 'Registered address', kind: 'textarea', max: 400, wide: true },
      ] },
    ],
  },
  {
    editors: CAN_BUILD,
    key: 'contact', title: 'Contact and grievance officer', intro: 'How shoppers reach you, and who answers a complaint.', preview: 'contact',
    blocks: [
      { title: 'How shoppers reach you', fields: [
        { key: 'supportEmail', label: 'Customer care email', kind: 'email', required: true },
        { key: 'supportPhone', label: 'Customer care phone', kind: 'phone' },
        { key: 'whatsapp', label: 'WhatsApp number', kind: 'phone', tip: 'A “Message us” button on your shop and on every order page.' },
        { key: 'instagram', label: 'Instagram handle', kind: 'text', max: 30 },
      ] },
      { title: 'Grievance officer', hint: 'Required by law and shown on your Contact page. A complaint is acknowledged within 48 hours and resolved within a month.', fields: [
        { key: 'grievanceName', label: 'Name', kind: 'text', max: 80 },
        { key: 'grievanceRole', label: 'Designation', kind: 'text', max: 60 },
        { key: 'grievanceEmail', label: 'Email', kind: 'email' },
        { key: 'grievancePhone', label: 'Phone', kind: 'phone' },
      ] },
    ],
  },
  {
    editors: CAN_BUILD,
    key: 'brand', title: 'Brand', intro: 'Your logo and one line about your brand. Colours, type and layout live in Look.', preview: 'brand',
    blocks: [
      { title: 'Look', fields: [
        { key: 'tagline', label: 'One line about your brand', kind: 'text', max: 150, wide: true, tip: 'Under your logo, and when your link is shared.' },
      ] },
      { title: 'Shop words', hint: 'The words Frrata writes on your shop: menus, buttons, delivery and returns. What you type stays as you typed it. Checkout stays in English for now.', fields: [
        { key: 'shopLanguage', label: 'Show them in', kind: 'select', options: LANGUAGE_OPTIONS },
      ] },
    ],
  },
  {
    editors: CAN_BUILD,
    key: 'policies', title: 'Policies', intro: 'Five pages written from your settings. Change a setting and the pages follow.', preview: 'policy',
    blocks: [
      { title: 'Returns', fields: [
        { key: 'returnKind', label: 'What shoppers can ask for', kind: 'select', options: RETURN_OPTIONS },
        { key: 'returnDays', label: 'Within', kind: 'select', options: RETURN_DAY_OPTIONS },
      ] },
    ],
  },
  {
    editors: CAN_BUILD,
    key: 'payments', title: 'Pay on delivery', intro: 'Your rules for cash and UPI on delivery. UPI and cards online come with Razorpay.', preview: 'checkout',
    blocks: [
      { title: 'Pay on delivery', fields: [
        { key: 'codOn', label: 'Offer Pay on delivery', kind: 'switch', wide: true },
        { key: 'codMin', label: 'Lowest order value, ₹', kind: 'rupees', hint: '0 for no lower limit.' },
        { key: 'codMax', label: 'Highest order value, ₹', kind: 'rupees', hint: 'Bigger orders must be paid online. 0 for no limit.' },
        { key: 'codCharge', label: 'Pay on delivery fee, ₹', kind: 'rupees', hint: '0 for none.', tip: 'Shown as its own line before the shopper orders, never added later.' },
        { key: 'codBlockedPincodes', label: 'Pincodes without Pay on delivery', kind: 'pincodes', wide: true, hint: 'Separated by commas or spaces.', tip: 'A shopper there sees why, and can still pay online.' },
      ] },
    ],
  },
  {
    editors: CAN_BUILD,
    key: 'shipping', title: 'Shipping and delivery', intro: 'What shoppers pay for delivery and how long it takes.', preview: 'checkout',
    blocks: [
      { title: 'What shoppers pay', fields: [
        { key: 'shippingFlat', label: 'Shipping charge, ₹', kind: 'rupees' },
        { key: 'freeShippingAbove', label: 'Free shipping above, ₹', kind: 'rupees', hint: '0 means never free.' },
      ] },
      { title: 'How long it takes', tip: 'Shown on every product page and at checkout, as a date range. Courier estimates replace these once Shiprocket is connected.', fields: [
        { key: 'dispatchDays', label: 'You dispatch within, days', kind: 'days' },
        { key: 'metroDays', label: 'Delivery to metros, days', kind: 'days' },
        { key: 'restDays', label: 'Delivery elsewhere, days', kind: 'days' },
      ] },
    ],
  },
  {
    editors: CAN_BUILD,
    key: 'taxes', title: 'Taxes and invoices', intro: 'GST on your prices and invoices.', preview: 'invoice',
    blocks: [
      { title: 'Registration', fields: [
        { key: 'gstRegistration', label: 'Registration', kind: 'radio', wide: true, options: REGISTRATION_OPTIONS,
          notes: { regular: 'Tax invoices', composition: 'Bill of supply · within your state', none: 'Bill of supply · within your state' } },
        { key: 'gstin', label: 'GSTIN', kind: 'gstin', showIf: { key: 'gstRegistration', in: ['regular', 'composition'] } },
        { key: 'homeState', label: 'Your business is in', kind: 'state', showIf: { key: 'gstRegistration', in: ['none'] }, hint: 'Your shop delivers within this state only: selling to another state needs a GSTIN.' },
        { key: 'turnoverBand', label: 'Turnover last year', kind: 'segmented', wide: true, options: TURNOVER_OPTIONS, showIf: { key: 'gstRegistration', in: ['regular'] },
          tip: 'All your GSTINs on one PAN, last financial year. It sets the HSN digits on invoices (4 under ₹5 crore, 6 above) and when e-invoicing applies.' },
        { key: 'gstFiling', label: 'GSTR-1', kind: 'segmented', wide: true, options: FILING_OPTIONS, showIf: { key: 'gstRegistration', in: ['regular'] } },
      ] },
      { title: 'Prices and business buyers', fields: [
        { key: 'pricesIncludeGst', label: 'My prices include GST', kind: 'switch', wide: true, showIf: { key: 'gstRegistration', in: ['regular'] } },
        { key: 'b2bInvoices', label: 'Businesses can ask for a GST invoice at checkout', kind: 'switch', wide: true, showIf: { key: 'gstRegistration', in: ['regular'] },
          tip: 'They enter their GSTIN and get an invoice they can claim input credit on. Turns itself off at ₹5 crore and above until e-invoicing is set up.' },
        { key: 'defaultHsn', label: 'HSN code new products start with', kind: 'hsn' },
      ] },
      { title: 'Invoice numbers', hint: 'One series a financial year, never reused. A new series starts on 1 April.', fields: [
        { key: 'invoiceSeries', label: 'Series prefix', kind: 'text', max: 5, hint: 'Up to 4 characters, or 5 ending in / or -.', tip: 'Like KS/. The year and the number follow it: KS/26-27/00001.' },
      ] },
    ],
  },
  {
    editors: CAN_BUILD,
    key: 'documents', title: 'Documents', intro: 'Your packing slips and invoices as PDFs: in your logo and colour, with your words.', preview: 'invoice',
    blocks: [
      { title: 'Invoices', fields: [
        { key: 'docSignatory', label: 'Authorised signatory', kind: 'text', max: 80, noLinks: true, tip: 'The name printed under “For <your business>” on each invoice, as GST asks.' },
        { key: 'docNote', label: 'Note at the foot of each invoice', kind: 'textarea', max: 240, wide: true, noLinks: true, tip: 'A return-policy line or a thank-you. Plain text: no links.' },
      ] },
      { title: 'Packing slips', tip: 'Each person’s last choice in the order queue wins; this is where a new teammate starts.', fields: [
        { key: 'slipSize', label: 'Slip size', kind: 'select', options: SLIP_SIZE_OPTIONS },
      ] },
    ],
  },
]

export const sectionFor = (key: string): Section | undefined => SECTIONS.find((s) => s.key === key)

/** GSTIN checks live in domains/tax/gstin.ts (checkout uses them too). */
export { gstinValid } from '../tax/gstin'
import { gstinValid } from '../tax/gstin'

const MOBILE = /^[6-9][0-9]{9}$/
/** "+91 98270-41000" → "9827041000"; null when it is not an Indian mobile number. */
export function normaliseMobile(raw: string): string | null {
  const d = raw.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '')
  return MOBILE.test(d) ? d : null
}

export type Values = Record<string, string | boolean | string[]>
export type Patch = Record<string, string | number | boolean | string[] | null>

/**
 * Checks one section's values as typed (rupees as text, switches as booleans)
 * and turns them into what is stored. Returns every error at once, by field.
 */
export function parseSection(section: Section, values: Values): { ok: true; patch: Patch } | { ok: false; errors: Record<string, string> } {
  const { patch, errors } = check(section, values)
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, patch }
}

/**
 * What an OPEN shop may not take away: the grievance officer the Consumer Protection (E-Commerce) Rules ask for,
 * shown on its Contact page. Only a field that is filled in now is held (`saved`), so a shop that opened without
 * one of them is never locked out of saving the rest. A shop not yet open may save them empty.
 */
export const NEEDED_WHEN_OPEN: Partial<Record<SectionKey, readonly (readonly [string, string])[]>> = {
  contact: [['grievanceName', 'name'], ['grievanceEmail', 'email'], ['grievancePhone', 'phone']],
}

export function openShopErrors(section: Section, patch: Patch, saved: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries((NEEDED_WHEN_OPEN[section.key] ?? [])
    .filter(([k]) => k in patch && !String(patch[k] ?? '').trim() && String(saved[k] ?? '').trim())
    .map(([k, what]) => [k, `Your shop is open: keep the grievance officer’s ${what}. The law asks for it on your Contact page.`]))
}

/** What the live preview shows while typing: every field that is already valid; the rest keep their saved value. */
export function draftPatch(section: Section, values: Values): Patch {
  return check(section, values).patch
}

function check(section: Section, values: Values): { patch: Patch; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const patch: Patch = {}
  for (const f of section.blocks.flatMap((b) => b.fields)) {
    // A field shown only for another choice is neither checked nor saved while hidden.
    if (f.showIf && !f.showIf.in.includes(String(values[f.showIf.key] ?? ''))) continue
    const raw = values[f.key]
    if (f.kind === 'switch') { patch[f.key] = raw === true; continue }
    if (f.kind === 'pincodes') {
      const list = (Array.isArray(raw) ? raw.join(' ') : String(raw ?? '')).split(/[\s,]+/).filter(Boolean)
      const bad = list.find((p) => !PINCODE_SHAPE.test(p))
      if (bad) errors[f.key] = `${bad} is not a pincode: 6 digits starting with 1 to 9.`
      else if (list.length > 500) errors[f.key] = 'Up to 500 pincodes.'
      else patch[f.key] = [...new Set(list)].sort()
      continue
    }
    const s = String(raw ?? '').trim()
    if (f.required && !s) { errors[f.key] = 'Needed.'; continue }
    // The invoice series must leave room for a whole year of numbers inside GST's 16 characters (work.ts).
    if (f.key === 'invoiceSeries' && s && !seriesFits(s)) { errors[f.key] = 'Too long: up to 4 characters, or 5 ending in / or -.'; continue }
    if (f.max && s.length > f.max) { errors[f.key] = `Up to ${f.max} characters.`; continue }
    // Words printed on a document stay words: a PDF viewer turns a typed address into a live link (plan finding 5).
    if (f.noLinks && /https?:\/\/|www\./i.test(s)) { errors[f.key] = 'No web addresses here: plain words only.'; continue }
    switch (f.kind) {
      case 'email':
        if (s && !EMAIL_SHAPE.test(s)) errors[f.key] = 'Check this email address.'
        else patch[f.key] = s.toLowerCase()
        break
      case 'phone': {
        if (!s) { patch[f.key] = ''; break }
        const m = normaliseMobile(s)
        if (!m) errors[f.key] = 'A 10-digit Indian mobile number.'
        else patch[f.key] = m
        break
      }
      case 'rupees': {
        const clean = s.replace(/[,₹\s]/g, '')
        if (!/^\d{1,7}$/.test(clean)) errors[f.key] = 'Whole rupees, digits only.'
        else patch[f.key] = Number(clean) * 100
        break
      }
      case 'days':
        if (!/^\d{1,2}$/.test(s) || Number(s) > 30) errors[f.key] = 'A number of days, up to 30.'
        else patch[f.key] = Number(s)
        break
      case 'radio': case 'segmented':
        if (!f.options!.some(([v]) => v === s)) errors[f.key] = 'Choose one.'
        else patch[f.key] = s
        break
      case 'state':
        if (!Object.values(STATE_CODE).includes(s)) errors[f.key] = 'Choose your state.'
        else patch[f.key] = s
        break
      case 'select':
        if (!f.options!.some(([v]) => v === s)) errors[f.key] = 'Choose one.'
        else patch[f.key] = /^\d+$/.test(s) ? Number(s) : s
        break
      case 'gstin': {
        const g = s.toUpperCase().replace(/\s/g, '')
        if (!g) { patch[f.key] = null; break }
        if (!gstinValid(g)) errors[f.key] = 'A GSTIN is 15 characters, like 23ABCDE1234F1Z5, and its last character must match.'
        else patch[f.key] = g
        break
      }
      case 'hsn':
        if (!/^\d{4}(\d{2})?(\d{2})?$/.test(s)) errors[f.key] = 'An HSN code is 4, 6 or 8 digits.'
        else patch[f.key] = s
        break
      default:
        patch[f.key] = f.key === 'orderPrefix' ? s.toUpperCase().replace(/[^A-Z0-9]/g, '') : f.key === 'instagram' ? s.replace(/^@/, '') : s
    }
  }
  if (section.key === 'payments' && !errors.codMin && !errors.codMax) {
    const min = patch.codMin as number, max = patch.codMax as number
    if (max > 0 && min > max) errors.codMin = 'Lower than the highest value.'
  }
  if (section.key === 'taxes') taxesPatch(values, patch, errors)
  for (const k of Object.keys(errors)) delete patch[k]
  return { patch, errors }
}

/**
 * Registration is one choice on screen and two columns (plan 2026-11-09-gst-core-and-categories, review finding 3):
 * "Not registered" is no GSTIN; Regular and Composition need one and set gst_scheme. The shop's state comes from the
 * GSTIN when there is one. Business invoices are off at ₹5 crore and above until e-invoicing is set up.
 */
function taxesPatch(values: Values, patch: Patch, errors: Record<string, string>) {
  const reg = String(values.gstRegistration ?? 'none')
  delete patch.gstRegistration
  if (reg === 'none') { patch.gstin = null; patch.gstScheme = 'regular'; if (!patch.homeState && !errors.homeState) errors.homeState = 'Choose your state.'; return }
  patch.gstScheme = reg
  if (!patch.gstin && !errors.gstin) errors.gstin = 'Your GSTIN, as registered.'
  if (typeof patch.gstin === 'string') patch.homeState = patch.gstin.slice(0, 2)
  if (reg === 'composition') { patch.pricesIncludeGst = true; patch.b2bInvoices = false }
  if (reg === 'regular' && patch.turnoverBand && patch.turnoverBand !== 'under_5cr') patch.b2bInvoices = false
}

/** Stored values → what the form shows (rupees as text, lists as text). The inverse of parseSection. */
export function formValues(section: Section, stored: Record<string, unknown>): Values {
  const v: Values = {}
  for (const f of section.blocks.flatMap((b) => b.fields)) {
    const x = stored[f.key]
    if (f.key === 'gstRegistration') v[f.key] = stored.gstin ? String(stored.gstScheme ?? 'regular') : 'none'
    else if (f.kind === 'switch') v[f.key] = x === true
    else if (f.kind === 'rupees') v[f.key] = String(Math.round(Number(x ?? 0) / 100))
    else if (f.kind === 'pincodes') v[f.key] = (Array.isArray(x) ? x : []).join(', ')
    else v[f.key] = x == null ? '' : String(x)
  }
  return v
}

/** What a merchant still has to fill before live payments — derived, never stored. Each item names its section. */
/**
 * THE ONE ANSWER to "does this shop have its grievance officer": a name, an email and a phone (Consumer
 * Protection (E-Commerce) Rules; owner 2026-11-07). Read by the setup checklist and opening the shop, by live
 * payments, and by the settings page's summary, so the three can never disagree again.
 */
export const grievanceComplete = (s: { grievanceName: string; grievanceEmail: string; grievancePhone: string }) =>
  !!s.grievanceName.trim() && !!s.grievanceEmail.trim() && !!s.grievancePhone.trim()

export function missingForLivePayments(s: { legalName: string; address: string; supportEmail: string; supportPhone: string; grievanceName: string; grievanceEmail: string; grievancePhone: string }): { label: string; section: SectionKey }[] {
  const out: { label: string; section: SectionKey }[] = []
  if (!s.legalName.trim()) out.push({ label: 'Legal business name', section: 'store' })
  if (!s.address.trim()) out.push({ label: 'Registered address', section: 'store' })
  if (!s.supportEmail.trim() || !s.supportPhone.trim()) out.push({ label: 'Customer care email and phone', section: 'contact' })
  if (!grievanceComplete(s)) out.push({ label: 'Grievance officer', section: 'contact' })
  return out
}
