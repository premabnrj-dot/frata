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
    const ok = parseSection(s('taxes'), { ...base, gstRegistration: 'regular', pricesIncludeGst: true, gstin: ' 27aapfu0939f1zv ' })
    expect(ok.ok && ok.patch).toMatchObject({ gstin: '27AAPFU0939F1ZV', gstScheme: 'regular', homeState: '27', b2bInvoices: true })
    expect(ok.ok && 'gstRegistration' in ok.patch).toBe(false)
    const none = parseSection(s('taxes'), { ...base, gstRegistration: 'none', pricesIncludeGst: false, gstin: '27AAPFU0939F1ZV', homeState: '08' })
    expect(none.ok && none.patch).toMatchObject({ gstin: null, homeState: '08' })
    expect(parseSection(s('taxes'), { ...base, gstRegistration: 'none', gstin: '' }).ok).toBe(false) // the state is needed
    expect(parseSection(s('taxes'), { ...base, gstRegistration: 'regular', gstin: '' }).ok).toBe(false) // the GSTIN is needed
    const comp = parseSection(s('taxes'), { ...base, gstRegistration: 'composition', gstin: '29AAGCB7383J1Z4', pricesIncludeGst: false })
    expect(comp.ok && comp.patch).toMatchObject({ gstScheme: 'composition', homeState: '29', b2bInvoices: false })
    const big = parseSection(s('taxes'), { ...base, gstRegistration: 'regular', gstin: '29AAGCB7383J1Z4', turnoverBand: 'over_10cr', b2bInvoices: true })
    expect(big.ok && big.patch.b2bInvoices).toBe(false) // business invoices wait for e-invoicing
    expect(formValues(s('taxes'), { gstin: null, gstScheme: 'regular' }).gstRegistration).toBe('none')
    expect(formValues(s('taxes'), { gstin: '29AAGCB7383J1Z4', gstScheme: 'composition' }).gstRegistration).toBe('composition')
    const bad = parseSection(s('taxes'), { pricesIncludeGst: true, gstin: '', defaultHsn: '62', invoiceSeries: '' })
    expect(bad.ok).toBe(false)
  })
  it('requires the shop name and customer care email; cleans prefix and handle', () => {
    expect(parseSection(s('store'), { name: '', orderPrefix: '', legalName: '', originCountry: 'India', address: '' }).ok).toBe(false)
    const r = parseSection(s('store'), { name: 'Kesar', orderPrefix: 'ks-', legalName: '', originCountry: 'India', address: '' })
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
    const stored = { name: 'Kesar', orderPrefix: 'KS', legalName: 'Kesar LLP', originCountry: 'India', address: 'Indore', supportEmail: 'a@b.in', supportPhone: '9827041000', whatsapp: '', instagram: 'k', grievanceName: 'R', grievanceRole: '', grievanceEmail: 'g@b.in', grievancePhone: '9827041001', accent: 'oxide', displayFont: 'fraunces', tagline: '', shopLanguage: 'hi', returnKind: 'exchange_or_refund', returnDays: 7, codOn: true, codMin: 0, codMax: 300000, codCharge: 4900, codBlockedPincodes: ['793001'], shippingFlat: 7900, freeShippingAbove: 199900, dispatchDays: 2, metroDays: 4, restDays: 7, pricesIncludeGst: true, gstin: null, gstScheme: 'regular', homeState: '23', turnoverBand: 'under_5cr', gstFiling: 'monthly', b2bInvoices: true, defaultHsn: '6211', invoiceSeries: 'KS/', docSignatory: 'R. Sharma', docNote: 'Exchanges within 7 days.', slipSize: 'label' }
    for (const sec of SECTIONS) {
      const r = parseSection(sec, formValues(sec, stored))
      expect(r.ok, sec.key).toBe(true)
      if (r.ok) for (const [k, v] of Object.entries(r.patch)) expect(v, `${sec.key}.${k}`).toEqual((stored as Record<string, unknown>)[k])
    }
  })
})

describe('missingForLivePayments', () => {
  const full = { legalName: 'Kesar LLP', address: 'Indore', supportEmail: 'a@b.in', supportPhone: '9827041000', grievanceName: 'R', grievanceEmail: 'g@b.in', grievancePhone: '9827041001' }
  it('is empty when everything the law and Razorpay ask is there', () => expect(missingForLivePayments(full)).toEqual([]))
  it('names what is missing and where it is fixed', () => {
    expect(missingForLivePayments({ ...full, grievancePhone: '', legalName: '' })).toEqual([
      { label: 'Legal business name', section: 'store' }, { label: 'Grievance officer', section: 'contact' }])
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
    const sec = SECTIONS.find((x) => x.key === 'documents')!
    expect(parseSection(sec, { docSignatory: 'Riya', docNote: 'Pay at https://x.test', slipSize: 'a4' }).ok).toBe(false)
    expect(parseSection(sec, { docSignatory: 'www.riya.in', docNote: '', slipSize: 'a4' }).ok).toBe(false)
    expect(parseSection(sec, { docSignatory: 'Riya Mehta', docNote: 'Exchanges within 7 days.', slipSize: 'label' }).ok).toBe(true)
  })
})
