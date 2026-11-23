// C1 category packs (plan docs/plans/2026-11-23-c1-category-packs.md, C1a·1): every value a store's sell list derives,
// measured on the code before the registry (2026-11-23), so the refactor can prove a store sees no change. Rows are
// only ever added (C1c·1 and each new pack); a row that changes means a store would see a change. Read by
// sells-today.test.ts and by the add-a-pack proof (packs/__tests__/add-a-pack.test.ts).

export const F = 'Clothes, footwear and accessories must be unused, unwashed and with their tags.'
export const J = 'Jewellery must be unworn, in its original packaging.'
export const S = 'Beauty, personal care and wellness products can be returned only unopened, with their seal intact: once opened they can’t be taken back, for hygiene.'
const LINE = { F, J, S } as const
/** 'F J' → the two sentences joined by one space, as the returns page says them. */
export const lines = (letters: string) => (letters ? letters.split(' ').map((k) => LINE[k as keyof typeof LINE]).join(' ') : '')

export type Row = [sells: string[], hsn: string, sized: boolean, presets: string[], label: boolean, sample: string, returns: string]
const K = 'Kurta set · Women', M = 'Shirt · Men', O = 'One size'
export const TODAY: Row[] = [
  [[], '6211', true, [K, M, O], false, 'clothing', 'F'],
  [['women'], '6204', true, [K, O], false, 'clothing', 'F'],
  [['men'], '6203', true, [M, O], false, 'clothing', 'F'],
  [['men', 'women'], '6204', true, [M, K, O], false, 'clothing', 'F'],
  [['kids'], '6209', true, ['Kids', O], false, 'clothing', 'F'],
  [['ethnic'], '6211', true, [K, O], false, 'clothing', 'F'],
  [['accessories'], '4202', false, [O], false, 'accessories', 'F'],
  [['footwear'], '6403', true, ['Footwear', O], false, 'footwear', 'F'],
  [['jewellery'], '7117', false, [O], false, 'accessories', 'J'],
  [['beauty'], '3304', false, [O], true, 'clothing', 'S'],
  [['wellness'], '3004', false, [O], true, 'clothing', 'S'],
  [['women', 'beauty'], '6204', true, [K, O], true, 'clothing', 'F S'],
  [['ethnic', 'women'], '6211', true, [K, O], false, 'clothing', 'F'],
  [['jewellery', 'men'], '6203', true, [O, M], false, 'clothing', 'F J'],
  [['footwear', 'accessories'], '6403', true, ['Footwear', O], false, 'accessories', 'F'],
  [['jewellery', 'footwear'], '6403', true, [O, 'Footwear'], false, 'accessories', 'F J'],
  [['women', 'jewellery', 'wellness'], '6204', true, [K, O], true, 'clothing', 'F J S'],
  [['beauty', 'wellness'], '3304', false, [O], true, 'clothing', 'S'],
  [['unknown'], '6211', false, [O], false, 'clothing', ''],
]

/** A complete shop's policy facts with the given sell list (the returns page reads only sells and the return kind here). */
export const factsFor = (sells: readonly string[]) => ({
  shopName: 'Kesar Studio', legalName: 'Kesar Studio LLP', address: '14 Shanti Nagar, Indore 452009', supportEmail: 'hello@kesar.in', supportPhone: '9827041000',
  grievanceName: 'Riya Mehta', grievanceRole: 'Partner', grievanceEmail: 'care@kesar.in', grievancePhone: '9827041001',
  returnKind: 'exchange_or_refund' as const, returnDays: 7, shippingFlat: 7900, freeShippingAbove: 199900, dispatchDays: 2, metroDays: 4, restDays: 7,
  codOn: true, codMax: 300000, codCharge: 4900, pricesIncludeGst: true, sells,
})
export const LEAD = 'You can ask for an exchange or a refund within 7 days of delivery. '
