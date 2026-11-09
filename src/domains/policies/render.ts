// =============================================================================
// FILE: src/domains/policies/render.ts
//
// A SHOP'S FIVE POLICY PAGES, WRITTEN FROM ITS SETTINGS. Rendered when read,
// never copied: change the shipping charge and the Shipping page follows. A
// merchant may rewrite a page (shop_policies); it then stops following and the
// console says so. Pure. The text is a starting point — the owner has it read
// by a lawyer once (Phase 1 owner call 13).
// =============================================================================

export const POLICY_PAGES = [
  ['returns', 'Returns and exchanges'],
  ['shipping', 'Shipping'],
  ['privacy', 'Privacy'],
  ['terms', 'Terms of sale'],
  ['contact', 'Contact'],
] as const
export type PolicyPage = (typeof POLICY_PAGES)[number][0]

export type PolicyFacts = {
  shopName: string
  legalName: string
  address: string
  supportEmail: string
  supportPhone: string
  grievanceName: string
  grievanceRole: string
  grievanceEmail: string
  grievancePhone: string
  returnKind: 'exchange_or_refund' | 'exchange_only' | 'refund_only' | 'none'
  returnDays: number
  shippingFlat: number
  freeShippingAbove: number
  dispatchDays: number
  metroDays: number
  restDays: number
  codOn: boolean
  codMax: number
  codCharge: number
  pricesIncludeGst: boolean
  /** What the shop sells (shop_settings.sells): beauty and wellness return only sealed (hygiene), jewellery with its packaging. */
  sells: readonly string[]
}

/** A run of text, or a fact from settings — `value` null when the merchant has not filled it in. */
export type Piece = { text: string } | { fact: string; value: string | null }

const fact = (label: string, value: string | null | undefined): Piece => ({ fact: label, value: value && value.trim() ? value.trim() : null })
const t = (text: string): Piece => ({ text })

/** What a returned item must be, by what the shop sells (a mixed shop gets each line that applies). */
function condition(sells: readonly string[]): string {
  const has = (...k: string[]) => sells.some((x) => k.includes(x))
  const fashion = sells.length === 0 || has('women', 'men', 'kids', 'ethnic', 'footwear', 'accessories')
  return [
    ...(fashion ? ['Clothes, footwear and accessories must be unused, unwashed and with their tags.'] : []),
    ...(has('jewellery') ? ['Jewellery must be unworn, in its original packaging.'] : []),
    ...(has('beauty', 'wellness') ? ['Beauty, personal care and wellness products can be returned only unopened, with their seal intact: once opened they can’t be taken back, for hygiene.'] : []),
  ].join(' ')
}

/** Each page as paragraphs of pieces. `inr` formats paise; injected so this stays pure and shares the console's formatting. */
export function renderPolicy(page: PolicyPage, f: PolicyFacts, inr: (paise: number) => string): Piece[][] {
  const phone = (p: string) => (p ? `+91 ${p.slice(0, 5)} ${p.slice(5)}` : '')
  switch (page) {
    case 'returns':
      if (f.returnKind === 'none') return [
        [t('Items cannot be returned or exchanged unless they arrive damaged, faulty or not what you ordered. Then write to '), fact('customer care email', f.supportEmail), t(' within 48 hours of delivery with a photo, and we will replace the item or refund you in full.')],
      ]
      return [
        [t('You can ask for '), t({ exchange_or_refund: 'an exchange or a refund', exchange_only: 'an exchange', refund_only: 'a refund' }[f.returnKind]), t(' within '), fact('return window', `${f.returnDays} days`), t(' of delivery. '), t(condition(f.sells))],
        [t('Write to '), fact('customer care email', f.supportEmail), t(' with your order number. We arrange the pickup where the courier serves your pincode.')],
        ...(f.returnKind !== 'exchange_only' ? [[t('Refunds go to the original payment method within 7 working days of the item reaching us. Pay on delivery orders are refunded by UPI or bank transfer.')]] : []),
        [t('Damaged, faulty or wrong items are always taken back, whatever the window.')],
      ]
    case 'shipping':
      return [
        [t('We dispatch within '), fact('dispatch time', `${f.dispatchDays} day${f.dispatchDays === 1 ? '' : 's'}`), t('. Delivery takes up to '), fact('metro delivery time', `${f.metroDays} days`), t(' to metro cities and up to '), fact('delivery time elsewhere', `${f.restDays} days`), t(' elsewhere.')],
        [t('Shipping costs '), fact('shipping charge', f.shippingFlat ? inr(f.shippingFlat) : 'nothing'),
          ...(f.shippingFlat && f.freeShippingAbove ? [t(', and is free on orders above '), fact('free shipping above', inr(f.freeShippingAbove))] : []), t('.')],
        ...(f.codOn ? [[t('Pay on delivery is available'), ...(f.codMax ? [t(' on orders up to '), fact('Pay on delivery limit', inr(f.codMax))] : []),
          ...(f.codCharge ? [t(', with a '), fact('Pay on delivery fee', inr(f.codCharge)), t(' fee shown before you order')] : []), t('.')]] : []),
      ]
    case 'privacy':
      return [
        [fact('legal business name', f.legalName), t(' collects your name, phone number, email and address to deliver your order and to tell you about it, and nothing else without asking you.')],
        [t('Online payments are handled by Razorpay; we never see your card or UPI details. Your details are shared only with the courier that delivers your order.')],
        [t('To see, correct or delete what we hold about you, write to our grievance officer, '), fact('grievance officer', f.grievanceName), t(', at '), fact('grievance email', f.grievanceEmail), t('.')],
      ]
    case 'terms':
      return [
        [t('This shop is run by '), fact('legal business name', f.legalName), t(', '), fact('registered address', f.address), t('.')],
        [t('Prices are in Indian rupees and '), t(f.pricesIncludeGst ? 'include GST' : 'do not include GST, which is added at checkout'), t('. Every charge is shown before you place your order.')],
        [t('You can cancel an order at no charge until it is dispatched.')],
        [t('A complaint is acknowledged within 48 hours and resolved within a month. Write to '), fact('grievance officer', f.grievanceName), t(' at '), fact('grievance email', f.grievanceEmail), t('.')],
      ]
    case 'contact':
      return [
        [fact('shop name', f.shopName), t(' is run by '), fact('legal business name', f.legalName), t(', '), fact('registered address', f.address), t('.')],
        [t('Customer care: '), fact('customer care email', f.supportEmail), t(' · '), fact('customer care phone', phone(f.supportPhone)), t('.')],
        [t('Grievance officer: '), fact('grievance officer', f.grievanceName), ...(f.grievanceRole ? [t(`, ${f.grievanceRole}`)] : []), t(' · '), fact('grievance email', f.grievanceEmail), t(' · '), fact('grievance phone', phone(f.grievancePhone)), t('. A complaint is acknowledged within 48 hours and resolved within a month.')],
      ]
  }
}

/** The facts a page is missing, by name, for "Missing details" in the console. */
export function missingFacts(pieces: Piece[][]): string[] {
  return [...new Set(pieces.flat().flatMap((p) => ('fact' in p && p.value === null ? [p.fact] : [])))]
}
