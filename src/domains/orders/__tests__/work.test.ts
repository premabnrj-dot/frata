import { describe, expect, it } from 'vitest'
import { ORDER_STATES } from '../order-state'
import { ACTIONS, applies, invoiceNumber, may, primaryAction, ROLES } from '../work'

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
  })
  it('every state has at most one primary action, and it always applies', () => {
    for (const s of ORDER_STATES) {
      const p = primaryAction(s)
      if (p === 'confirm') expect(applies('confirm', s)).toBe(true)
      if (p === 'pack') expect(applies('pack', s)).toBe(true)
      if (p === 'cancel') expect(applies('cancel', s)).toBe(true)
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
