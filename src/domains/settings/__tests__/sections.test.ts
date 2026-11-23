import { describe, expect, it } from 'vitest'
import { formValues, gstinValid, missingForLivePayments, normaliseMobile, openShopErrors, parseSection, sectionFor, SECTIONS } from '../sections'

const s = (k: string) => sectionFor(k)!

describe('gstinValid', () => {
  it('accepts real GSTINs, refuses a wrong check character', () => {
    expect(gstinValid('27AAPFU0939F1ZV')).toBe(true)
    expect(gstinValid('29AAGCB7383J1Z4')).toBe(true)
    expect(gstinValid('27AAPFU0939F1ZA')).toBe(false)
    expect(gstinValid('27AAPFU0939F1Z')).toBe(false)
  })
})

describe('normaliseMobile', () => {
  it('takes the forms people type', () => {
    expect(normaliseMobile('+91 98270-41000')).toBe('9827041000')
    expect(normaliseMobile('09827041000')).toBe('9827041000')
    expect(normaliseMobile('98270 41000')).toBe('9827041000')
  })
  it('refuses what is not an Indian mobile', () => {
    expect(normaliseMobile('1234567890')).toBeNull()
    expect(normaliseMobile('98270')).toBeNull()
  })
})

describe('parseSection', () => {
  it('stores rupees as paise and lists as sorted, unique pincodes', () => {
    const r = parseSection(s('payments'), { codOn: true, codMin: '0', codMax: '3,000', codCharge: '₹49', codBlockedPincodes: '793001, 110001 793001' })
    expect(r).toEqual({ ok: true, patch: { codOn: true, codMin: 0, codMax: 300000, codCharge: 4900, codBlockedPincodes: ['110001', '793001'] } })
  })
  it('returns every error at once', () => {
    const r = parseSection(s('payments'), { codOn: true, codMin: '5000', codMax: '3000', codCharge: 'Rs 49', codBlockedPincodes: '12345' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['codBlockedPincodes', 'codCharge', 'codMin'])
  })
  it('normalises GSTIN, empty GSTIN is null, HSN shape', () => {
    const base = { turnoverBand: 'under_5cr', gstFiling: 'monthly', b2bInvoices: true, defaultHsn: '6211', invoiceSeries: 'KS/' }
    const ok = parseSection(s('business'), { ...base, gstRegistration: 'regular', pricesIncludeGst: true, gstin: ' 27aapfu0939f1zv ' })
    expect(ok.ok && ok.patch).toMatchObject({ gstin: '27AAPFU0939F1ZV', gstScheme: 'regular', homeState: '27', b2bInvoices: true })
    expect(ok.ok && 'gstRegistration' in ok.patch).toBe(false)
    const none = parseSection(s('business'), { ...base, gstRegistration: 'none', pricesIncludeGst: false, gstin: '27AAPFU0939F1ZV', homeState: '08' })
    expect(none.ok && none.patch).toMatchObject({ gstin: null, homeState: '08' })
    expect(parseSection(s('business'), { ...base, gstRegistration: 'none', gstin: '' }).ok).toBe(false) // the state is needed
    expect(parseSection(s('business'), { ...base, gstRegistration: 'regular', gstin: '' }).ok).toBe(false) // the GSTIN is needed
    const comp = parseSection(s('business'), { ...base, gstRegistration: 'composition', gstin: '29AAGCB7383J1Z4', pricesIncludeGst: false })
    expect(comp.ok && comp.patch).toMatchObject({ gstScheme: 'composition', homeState: '29', b2bInvoices: false })
    const big = parseSection(s('business'), { ...base, gstRegistration: 'regular', gstin: '29AAGCB7383J1Z4', turnoverBand: 'over_10cr', b2bInvoices: true })
    expect(big.ok && big.patch.b2bInvoices).toBe(false) // business invoices wait for e-invoicing
    expect(formValues(s('business'), { gstin: null, gstScheme: 'regular' }).gstRegistration).toBe('none')
    expect(formValues(s('business'), { gstin: '29AAGCB7383J1Z4', gstScheme: 'composition' }).gstRegistration).toBe('composition')
    const bad = parseSection(s('business'), { pricesIncludeGst: true, gstin: '', defaultHsn: '62', invoiceSeries: '' })
    expect(bad.ok).toBe(false)
  })
  it('requires the shop name and customer care email; cleans prefix and handle', () => {
    expect(parseSection(s('store'), { name: '', tagline: '', shopLanguage: 'en' }).ok).toBe(false)
    const r = parseSection(s('invoices'), { orderPrefix: 'ks-', invoiceSeries: 'KS/', docSignatory: '', docNote: '', slipSize: 'a4' })
    expect(r.ok && r.patch.orderPrefix).toBe('KS')
    const c = parseSection(s('contact'), { supportEmail: 'Hello@Kesar.in', supportPhone: '', whatsapp: '+91 98270 41000', instagram: '@kesar.studio', grievanceName: '', grievanceRole: '', grievanceEmail: '', grievancePhone: '' })
    expect(c.ok && [c.patch.supportEmail, c.patch.whatsapp, c.patch.instagram]).toEqual(['hello@kesar.in', '9827041000', 'kesar.studio'])
  })
  it('selects only take their options; numeric options are stored as numbers', () => {
    const r = parseSection(s('policies'), { returnKind: 'exchange_only', returnDays: '15' })
    expect(r).toEqual({ ok: true, patch: { returnKind: 'exchange_only', returnDays: 15 } })
    expect(parseSection(s('policies'), { returnKind: 'anything', returnDays: '15' }).ok).toBe(false)
  })
})

describe('formValues', () => {
  it('is the inverse of parseSection for every section', () => {
    const stored = { name: 'Kesar', orderPrefix: 'KS', legalName: 'Kesar LLP', originCountry: 'India', address: 'Indore', supportEmail: 'a@b.in', supportPhone: '9827041000', whatsapp: '', instagram: 'k', grievanceName: 'R', grievanceRole: '', grievanceEmail: 'g@b.in', grievancePhone: '9827041001', accent: 'oxide', displayFont: 'fraunces', tagline: '', pickupPincode: '452009', shopLanguage: 'hi', returnKind: 'exchange_or_refund', returnDays: 7, codOn: true, codMin: 0, codMax: 300000, codCharge: 4900, codBlockedPincodes: ['793001'], shippingFlat: 7900, freeShippingAbove: 199900, dispatchDays: 2, metroDays: 4, restDays: 7, pricesIncludeGst: true, gstin: null, gstScheme: 'regular', homeState: '23', turnoverBand: 'under_5cr', gstFiling: 'monthly', b2bInvoices: true, defaultHsn: '6211', invoiceSeries: 'KS/', docSignatory: 'R. Sharma', docNote: 'Exchanges within 7 days.', slipSize: 'label' }
    for (const sec of SECTIONS) {
      const r = parseSection(sec, formValues(sec, stored))
      expect(r.ok, sec.key).toBe(true)
      if (r.ok) for (const [k, v] of Object.entries(r.patch)) expect(v, `${sec.key}.${k}`).toEqual((stored as Record<string, unknown>)[k])
    }
  })  // O2a·0: the whole-section save a popup must not change (O2a·2 adds a subset parser beside it). A registered store too:
  // its GSTIN, scheme, state and the Regular switches come back as stored, for Regular and for Composition.
  it('round-trips a registered store, Regular and Composition', () => {
    const base = { legalName: 'Kesar LLP', originCountry: 'India', address: 'Indore', turnoverBand: 'under_5cr', gstFiling: 'quarterly', defaultHsn: '6204' }
    const regular = { ...base, gstin: '29AAGCB7383J1Z4', gstScheme: 'regular', homeState: '29', pricesIncludeGst: false, b2bInvoices: true }
    const composition = { ...base, gstin: '29AAGCB7383J1Z4', gstScheme: 'composition', homeState: '29', pricesIncludeGst: true, b2bInvoices: false }
    for (const stored of [regular, composition]) {
      const sec = sectionFor('business')!
      const r = parseSection(sec, formValues(sec, stored))
      expect(r.ok, stored.gstScheme).toBe(true)
      if (r.ok) for (const [k, v] of Object.entries(r.patch)) expect(v, `${stored.gstScheme}.${k}`).toEqual((stored as Record<string, unknown>)[k])
      if (r.ok) expect(Object.keys(r.patch)).toEqual(expect.arrayContaining(['gstin', 'gstScheme', 'homeState', 'legalName', 'address']))
    }
  })
})

describe('missingForLivePayments', () => {
  const full = { legalName: 'Kesar LLP', address: 'Indore', supportEmail: 'a@b.in', supportPhone: '9827041000', grievanceName: 'R', grievanceEmail: 'g@b.in', grievancePhone: '9827041001' }
  it('is empty when everything the law and Razorpay ask is there', () => expect(missingForLivePayments(full)).toEqual([]))
  it('names what is missing and where it is fixed', () => {
    expect(missingForLivePayments({ ...full, grievancePhone: '', legalName: '' })).toEqual([
      { label: 'Legal business name', section: 'business' }, { label: 'Grievance officer', section: 'contact' }])
  })
})

describe('cleaner screens (design-language § Labels, info tips and help text)', () => {
  it('no section needs more than three (i) tips: more means the labels are unclear', () => {
    for (const s of SECTIONS) {
      const tips = s.blocks.reduce((n, b) => n + (b.tip ? 1 : 0) + b.fields.filter((f) => f.tip).length, 0)
      expect(tips, s.key).toBeLessThanOrEqual(3)
    }
  })
  it('a visible line under a field is one short line', () => {
    for (const f of SECTIONS.flatMap((s) => s.blocks.flatMap((b) => b.fields))) if (f.hint) expect(f.hint.length, f.key).toBeLessThanOrEqual(110)
  })
})

describe('an open shop keeps its grievance officer', () => {
  it('emptying a filled-in grievance field is an error, named per field; a field already empty never locks the page', () => {
    const contact = s('contact')
    const saved = { grievanceName: 'Riya', grievanceEmail: 'care@x.in', grievancePhone: '' }
    expect(openShopErrors(contact, { grievanceName: '', grievanceEmail: '', grievancePhone: '' }, saved)).toEqual({
      grievanceName: expect.stringMatching(/officer’s name/), grievanceEmail: expect.stringMatching(/officer’s email/) })
    expect(openShopErrors(contact, { grievanceName: 'Riya', grievanceEmail: 'care@x.in', grievancePhone: '', supportEmail: 'new@x.in' }, saved)).toEqual({})
    expect(openShopErrors(s('store'), { name: '' }, { name: 'Kesar' })).toEqual({})
  })
})

describe('documents (D2)', () => {
  it('refuses a web address in the words printed on documents', () => {
    const sec = SECTIONS.find((x) => x.key === 'invoices')!
    expect(parseSection(sec, { docSignatory: 'Riya', docNote: 'Pay at https://x.test', slipSize: 'a4' }).ok).toBe(false)
    expect(parseSection(sec, { docSignatory: 'www.riya.in', docNote: '', slipSize: 'a4' }).ok).toBe(false)
    expect(parseSection(sec, { docSignatory: 'Riya Mehta', docNote: 'Exchanges within 7 days.', slipSize: 'label' }).ok).toBe(true)
  })
})

describe('Pickup PIN code (O1·5)', () => {
  const store = sectionFor('store')!
  const base = { name: 'Kesar Studio', tagline: '', shopLanguage: 'en' }
  it('is a field of Store details, after the line about the brand', () => {
    const keys = store.blocks.flatMap((b) => b.fields.map((f) => f.key))
    expect(keys.indexOf('pickupPincode')).toBe(keys.indexOf('tagline') + 1)
    expect(store.blocks.flatMap((b) => b.fields).find((f) => f.key === 'pickupPincode')).toMatchObject({ label: 'Pickup PIN code', kind: 'pincode' })
  })
  it('empty saves as null; six digits are kept', () => {
    expect(parseSection(store, { ...base, pickupPincode: '' })).toMatchObject({ ok: true, patch: { pickupPincode: null } })
    expect(parseSection(store, { ...base, pickupPincode: ' 302003 ' })).toMatchObject({ ok: true, patch: { pickupPincode: '302003' } })
  })
  it('a wrong shape is refused with the words', () => {
    for (const bad of ['02003', '30200', '0302003', '30200a']) {
      expect(parseSection(store, { ...base, pickupPincode: bad })).toEqual({ ok: false, errors: { pickupPincode: 'A PIN code is 6 digits and starts with 1 to 9.' } })
    }
  })
  it('formValues round-trips it (null reads as empty)', () => {
    expect(formValues(store, { name: 'K', pickupPincode: null }).pickupPincode).toBe('')
    expect(formValues(store, { name: 'K', pickupPincode: '302003' }).pickupPincode).toBe('302003')
  })
})

describe('parseFields (O2a·2: a setup popup saves only the fields it sent)', async () => {
  const { parseFields, SETUP_FIELDS } = await import('../fields')
  const stored = {
    name: 'Kesar Studio', legalName: 'Kesar LLP', originCountry: 'India', address: 'Indore', gstin: '29AAGCB7383J1Z4', gstScheme: 'regular', homeState: '29',
    turnoverBand: 'under_5cr', gstFiling: 'monthly', pricesIncludeGst: false, b2bInvoices: true, defaultHsn: '6204',
    supportEmail: 'care@kesar.in', supportPhone: '9827041000', whatsapp: '', instagram: 'kesar', grievanceName: 'Riya', grievanceRole: 'Founder', grievanceEmail: 'g@kesar.in', grievancePhone: '9827041001',
    codOn: true, codMin: 0, codMax: 300000, codCharge: 4900, codBlockedPincodes: [], pickupPincode: '452009', tagline: '', shopLanguage: 'en',
  }
  const biz = sectionFor('business')!, contact = sectionFor('contact')!, pay = sectionFor('payments')!, store = sectionFor('store')!
  it('names the popups’ subsets on the server', () => {
    expect(SETUP_FIELDS).toEqual({
      details: { business: ['legalName', 'gstRegistration', 'homeState', 'gstin'], contact: ['grievanceName', 'grievancePhone', 'grievanceEmail'] },
      payments: { payments: ['codOn', 'codMax'] },
      pickup: { store: ['pickupPincode'] },
    })
  })
  it('business, Not registered: writes the name, the state and no GSTIN; address, origin, turnover and HSN are left alone', () => {
    const r = parseFields(biz, SETUP_FIELDS.details.business, { legalName: 'Kesar Studio LLP', gstRegistration: 'none', homeState: '08', gstin: '' }, stored)
    expect(r).toEqual({ ok: true, patch: { legalName: 'Kesar Studio LLP', homeState: '08', gstin: null, gstScheme: 'regular' } })
  })
  it('business, Regular with a GSTIN: the state comes from the GSTIN', () => {
    const r = parseFields(biz, SETUP_FIELDS.details.business, { legalName: 'Kesar LLP', gstRegistration: 'regular', gstin: '29aagcb7383j1z4' }, { ...stored, gstin: null, homeState: '23' })
    if (!r.ok) expect.fail(JSON.stringify(r))
    expect(r.patch).toEqual({ legalName: 'Kesar LLP', gstin: '29AAGCB7383J1Z4', gstScheme: 'regular', homeState: '29' })
    expect(Object.keys(r.patch)).not.toContain('address')
  })
  it('a GSTIN left out of the values keeps the stored GSTIN: not in the patch, no error', () => {
    const r = parseFields(biz, SETUP_FIELDS.details.business, { legalName: 'Kesar LLP', gstRegistration: 'regular' }, stored)
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.patch).not.toHaveProperty('gstin'); expect(r.patch.homeState).toBe('29') }
  })
  it('Composition sets the two columns it implies', () => {
    const r = parseFields(biz, SETUP_FIELDS.details.business, { legalName: 'Kesar LLP', gstRegistration: 'composition', gstin: '29AAGCB7383J1Z4' }, stored)
    if (!r.ok) expect.fail(JSON.stringify(r))
    expect(r.patch).toEqual({ legalName: 'Kesar LLP', gstin: '29AAGCB7383J1Z4', gstScheme: 'composition', homeState: '29', pricesIncludeGst: true, b2bInvoices: false })
  })
  it('a typed field’s error comes back by field', () => {
    expect(parseFields(biz, SETUP_FIELDS.details.business, { legalName: 'K', gstRegistration: 'regular', gstin: '29AAGCB7383J1Z5' }, stored)).toMatchObject({ ok: false, errors: { gstin: expect.any(String) } })
  })
  it('contact: a grievance email left out keeps the stored one; customer care is never written', () => {
    const r = parseFields(contact, SETUP_FIELDS.details.contact, { grievanceName: 'Meera', grievancePhone: '98270 41002', supportEmail: 'x@evil.in' }, stored)
    expect(r).toEqual({ ok: true, patch: { grievanceName: 'Meera', grievancePhone: '9827041002' } })
  })
  it('payments: a highest order under the stored lowest is a stale lowest, not the typed field', () => {
    expect(parseFields(pay, SETUP_FIELDS.payments.payments, { codOn: true, codMax: '1,000' }, { ...stored, codMin: 200000 })).toEqual({ ok: false, stale: ['codMin'] })
    expect(parseFields(pay, SETUP_FIELDS.payments.payments, { codOn: false, codMax: '3,000', codCharge: '0' }, stored)).toEqual({ ok: true, patch: { codOn: false, codMax: 300000 } })
  })
  it('a key outside the subset is ignored, never written', () => {
    const r = parseFields(store, SETUP_FIELDS.pickup.store, { pickupPincode: '302003', name: 'Someone else' }, stored)
    expect(r).toEqual({ ok: true, patch: { pickupPincode: '302003' } })
  })
  it('pickup: empty is null', () => {
    expect(parseFields(store, SETUP_FIELDS.pickup.store, { pickupPincode: '' }, stored)).toEqual({ ok: true, patch: { pickupPincode: null } })
  })
})
