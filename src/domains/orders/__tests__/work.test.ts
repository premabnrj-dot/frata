import { describe, expect, it } from 'vitest'
import { ORDER_STATES } from '../order-state'
import { ACTIONS, applies, invoiceNumber, InvoiceNumberTooLong, MAX_IN_YEAR, may, primaryAction, ROLES, seriesFits } from '../work'

describe('who may do what to an order', () => {
  it('staff confirm, hold, note, pack and print; only owners and admins edit or cancel', () => {
    expect(may('confirm', 'unconfirmed', 'staff')).toBe(true)
    expect(may('pack', 'confirmed', 'staff')).toBe(true)
    expect(may('cancel', 'unconfirmed', 'staff')).toBe(false)
    expect(may('edit', 'unconfirmed', 'staff')).toBe(false)
    expect(may('cancel', 'unconfirmed', 'admin')).toBe(true)
    for (const a of ACTIONS) expect(ROLES[a]).toContain('owner')
  })
  it('actions apply only where they make sense', () => {
    expect(applies('confirm', 'paid')).toBe(false) // paid online needs no confirming
    expect(applies('pack', 'unconfirmed')).toBe(false) // confirm first
    expect(applies('pack', 'refund_due')).toBe(false) // its stock is not there
    expect(applies('edit', 'packed')).toBe(false) // the address is on the slip
    expect(applies('cancel', 'shipped')).toBe(false) // a return, Phase 2
    expect(applies('note', 'awaiting_payment')).toBe(false) // not an order yet: nothing for erasure to meet
    expect(applies('print', 'unconfirmed')).toBe(false) // confirm first
    expect(applies('print', 'cancelled')).toBe(false) // never a slip for a parcel that must not go
    expect(applies('print', 'shipped')).toBe(true) // a reprint while it is with the courier
  })
  it('every state has at most one primary action, and it always applies', () => {
    for (const s of ORDER_STATES) {
      const p = primaryAction(s)
      if (p === 'confirm') expect(applies('confirm', s)).toBe(true)
      if (p === 'pack') expect(applies('pack', s)).toBe(true)
      if (p === 'cancel') expect(applies('cancel', s)).toBe(true)
      if (p === 'print_slip') expect(applies('print', s)).toBe(true)
    }
    expect(primaryAction('refund_due')).toBe('cancel')
    expect(primaryAction('delivered')).toBe(null)
  })
})

describe('invoice numbers', () => {
  it('series, financial year and a padded count; a bill of supply has its own marker', () => {
    expect(invoiceNumber({ series: 'KS/', orderPrefix: 'KS', fiscalYear: '26-27', n: 1, kind: 'invoice' })).toBe('KS/26-27/00001')
    expect(invoiceNumber({ series: 'KESR/', orderPrefix: 'KS', fiscalYear: '26-27', n: 1, kind: 'bill' })).toBe('KESR/26-27/B0001')
    expect(invoiceNumber({ series: '', orderPrefix: 'KS', fiscalYear: '26-27', n: 42, kind: 'invoice' })).toBe('KS/26-27/00042')
    expect(invoiceNumber({ series: 'KESR', orderPrefix: 'KS', fiscalYear: '26-27', n: 7, kind: 'invoice' })).toBe('KESR/26-27/00007')
  })
  it('never longer than GST allows', () => {
    expect(invoiceNumber({ series: 'KESR/', orderPrefix: 'KS', fiscalYear: '26-27', n: 99_999, kind: 'invoice' })).toHaveLength(16)
    expect(() => invoiceNumber({ series: 'KESR/', orderPrefix: 'KS', fiscalYear: '26-27', n: 100_000, kind: 'invoice' })).toThrow(/16/)
  })
})

describe('a partner (approved scope: products, orders, settings, the look)', () => {
  it('works orders like staff, never cancels or edits one', () => {
    expect(may('confirm', 'unconfirmed', 'partner')).toBe(true)
    expect(may('pack', 'confirmed', 'partner')).toBe(true)
    expect(may('cancel', 'unconfirmed', 'partner')).toBe(false)
    expect(may('edit', 'unconfirmed', 'partner')).toBe(false)
  })
})

describe('a series that fits the year', () => {
  it('refuses what would pass 16 characters at the year\'s last number (architecture review 2026-11-07)', () => {
    expect(seriesFits('KESR')).toBe(true) // KESR/26-27/99999 = 16
    expect(seriesFits('KESR/')).toBe(true)
    expect(seriesFits('KESRI')).toBe(false) // KESRI/26-27/00001 = 17: every Mark packed failed
    expect(seriesFits('KS/')).toBe(true)
    expect(invoiceNumber({ series: 'KESR/', orderPrefix: 'KS', fiscalYear: '26-27', n: MAX_IN_YEAR.bill, kind: 'bill' })).toBe('KESR/26-27/B9999')
    expect(() => invoiceNumber({ series: 'KESR/', orderPrefix: 'KS', fiscalYear: '26-27', n: MAX_IN_YEAR.bill + 1, kind: 'bill' })).toThrow(InvoiceNumberTooLong)
  })
})

describe('shipping roles (Ship S·0)', () => {
  it('the shop\'s own people ship; only owners and admins mark an outcome; partners do neither', () => {
    expect([...ROLES.ship_self].sort()).toEqual(['admin', 'owner', 'staff'])
    for (const a of ['deliver', 'came_back', 'lost'] as const) expect([...ROLES[a]].sort()).toEqual(['admin', 'owner'])
    expect(may('ship_self', 'packed', 'partner')).toBe(false)
    expect(may('ship_self', 'packed', 'staff')).toBe(true)
    expect(may('deliver', 'shipped', 'staff')).toBe(false)
    expect(may('deliver', 'ndr', 'owner')).toBe(true)
    expect(applies('ship_self', 'confirmed')).toBe(false)
    expect(primaryAction('shipped')).toBe(null) // Delivered lives in the Ship panel
  })
})

describe('credit notes (Documents D3)', () => {
  it('number in their own C series within 16 characters; owners and admins only, after a cancel or a return', async () => {
    const { invoiceNumber, seriesFits, may, applies } = await import('../work')
    expect(invoiceNumber({ series: 'KS/', orderPrefix: 'KS', fiscalYear: '26-27', n: 1, kind: 'credit' })).toBe('KS/26-27/C0001')
    expect(invoiceNumber({ series: 'KESR/', orderPrefix: 'KS', fiscalYear: '26-27', n: 9_999, kind: 'credit' })).toHaveLength(16)
    expect(seriesFits('KESR/')).toBe(true)
    expect(applies('credit', 'cancelled') && applies('credit', 'rto_received')).toBe(true)
    expect(applies('credit', 'delivered') || applies('credit', 'packed')).toBe(false)
    expect(may('credit', 'cancelled', 'owner')).toBe(true)
    expect(may('credit', 'cancelled', 'staff')).toBe(false)
  })
})
