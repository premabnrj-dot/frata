import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { cleanEmail, inboxOf, maskEmail, EMAIL_SQL } from '../shape'
import { suggestEmail } from '../typo'
import { messageState, stateWords } from '../state'
import { html, escapeHtml } from '../html'
import { frrataEmail, shopEmail, MAX_EMAIL_BYTES } from '../layouts'
import { DEFAULT_WORDS, WORD_FIELDS, WORD_LIMITS } from '../words'
import { fill, unknownPlaceholders } from '@/domains/messaging/placeholders'
import { ORDER_MESSAGES } from '@/domains/messaging/events'

describe('shape', () => {
  it('accepts, trims, lowers', () => expect(cleanEmail('  Asha.Rao@Gmail.com ')).toBe('asha.rao@gmail.com'))
  it.each(['', 'a@b', 'a b@c.in', 'a@-b.in', '@x.in', 'a@b..in', 'ä@x.in', `${'a'.repeat(65)}@x.in`, 'a\n@x.in', 7])('refuses %s', (v) => expect(cleanEmail(v)).toBeNull())
  it('masks', () => expect(maskEmail('asha@gmail.com')).toBe('as•••@gmail.com'))
})

describe('typo', () => {
  it.each([['asha@gmial.com', 'asha@gmail.com'], ['asha@gmail.con', 'asha@gmail.com'], ['a@yaho.com', 'a@yahoo.com'], ['a@rediffmal.com', 'a@rediffmail.com']])('%s → %s', (a, b) => expect(suggestEmail(a)).toBe(b))
  it.each(['a@gmail.com', 'a@kesarstudio.in'])('leaves %s', (a) => expect(suggestEmail(a)).toBeNull())
})

describe('state', () => {
  const base = { createdAt: new Date(), attemptedAt: null, sentAt: null, deliveredAt: null, bouncedAt: null, complainedAt: null, failedAt: null, skippedAt: null, skipCode: null, bounceKind: null }
  it('derives from timestamps', () => {
    expect(messageState(base)).toBe('queued')
    expect(messageState({ ...base, sentAt: new Date(), deliveredAt: new Date() })).toBe('delivered')
    expect(stateWords({ ...base, skippedAt: new Date(), skipCode: 'off' })).toMatch(/switched off/)
    expect(stateWords({ ...base, bouncedAt: new Date(), bounceKind: 'permanent' })).toBe('Bounced: no such address')
  })
})

describe('html escapes everything interpolated', () => {
  it('escapes', () => {
    expect(html`<p>${'<script>"x"'}</p>`.value).toBe('<p>&lt;script&gt;&quot;x&quot;</p>')
    expect(escapeHtml("a'b")).toBe('a&#39;b')
  })
})

const footer = { legalName: 'Kesar Studio LLP', address: '12 MI Road, Jaipur 302001', grievance: 'Riya Mehta, care@kesarstudio.in', supportEmail: 'care@kesarstudio.in', newDropsHref: 'https://kesar-studio.frrata.shop/email/drops?t=x' }

describe('layouts', () => {
  it('every order email renders under 60 kB, with a text part, and refuses markup in a shop\'s words', () => {
    for (const k of ORDER_MESSAGES) {
      const w = DEFAULT_WORDS[k]
      const v = { 'First name': 'Asha', 'Order number': 'KS-1043', Total: '₹2,490', 'Shop name': 'Kesar Studio', Courier: 'Delhivery', 'Tracking number': '149022' } as const
      const r = shopEmail({ preview: fill(w.preview, v), shop: { name: 'Kesar Studio', logoUrl: null, accent: '#A2462A' }, heading: fill(w.heading, v), message: fill(w.message, v) + '<img src=x onerror=alert(1)>',
        button: { label: w.button, href: 'https://kesar-studio.frrata.shop/orders' }, order: { number: 'KS-1043', date: '11 Nov', items: [{ title: 'Kurta <b>', detail: 'Rust · M · 1' }], total: '₹2,490', payLine: 'Pay ₹2,490 on delivery' }, footer })
      expect(Buffer.byteLength(r.html)).toBeLessThan(MAX_EMAIL_BYTES)
      expect(r.text).toContain('KS-1043')
      expect(r.html).not.toContain('<img src=x')
      expect(r.html).toContain('Kurta &lt;b&gt;')
      expect(r.html).not.toMatch(/frrata(?!\.shop)/i) // no Frrata mark in a shop's email (spec § 1)
    }
  })
  it('drops a non-https link and a bad colour', () => {
    const r = shopEmail({ preview: 'p', shop: { name: 'S', logoUrl: 'javascript:alert(1)', accent: 'red;background:url(x)' }, heading: 'h', message: 'm', button: { label: 'Go', href: 'javascript:alert(1)' }, order: null, footer: { ...footer, grievance: null, newDropsHref: null } })
    expect(r.html).not.toContain('javascript:')
    expect(r.html).not.toContain('url(x)')
  })
  it('Frrata layout', () => {
    const r = frrataEmail({ preview: 'Debit', heading: '₹6,240 will be debited on 3 Dec', message: 'Line', button: { label: 'See the bill', href: 'https://frata.vercel.app/console/settings/billing' }, footer: 'Frrata' })
    expect(r.html).toContain('frrata')
    expect(r.text).toContain('See the bill: https://')
  })
})

describe('default words', () => {
  it('fit their limits and use only menu placeholders', () => {
    for (const k of ORDER_MESSAGES) for (const f of WORD_FIELDS) {
      expect(DEFAULT_WORDS[k][f].length).toBeLessThanOrEqual(WORD_LIMITS[f])
      expect(unknownPlaceholders(DEFAULT_WORDS[k][f])).toEqual([])
    }
  })
})

describe('the SQL CHECK says what shape.ts says', () => {
  it('0096 carries EMAIL_SQL', () => {
    let sql = ''
    try { sql = readFileSync('drizzle/0096_email.sql', 'utf8') } catch { throw new Error('drizzle/0096_email.sql is missing') }
    expect(sql).toContain(EMAIL_SQL.replace(/'/g, "''"))
  })
})

import { cleanSubject, fromHeader } from '../headers'
describe('headers', () => {
  it('strips what could break a header', () => {
    expect(fromHeader('Kesar "Studio" <x>,;', 'k@frratamail.app')).toBe('"Kesar Studio x" <k@frratamail.app>')
    expect(fromHeader('केसर', 'k@frratamail.app')).toMatch(/^=\?UTF-8\?B\?.+\?= <k@frratamail\.app>$/)
    expect(cleanSubject('Hi\r\nBcc: x@y')).toBe('Hi Bcc: x@y')
  })
})

describe('inboxOf (mail limits count one inbox)', () => {
  it('drops a +tag', () => expect(inboxOf('asha+1@example.in')).toBe('asha@example.in'))
  it('drops Gmail dots and folds googlemail', () => expect(inboxOf('a.s.ha+x@googlemail.com')).toBe('asha@gmail.com'))
  it('keeps dots elsewhere', () => expect(inboxOf('a.sha@example.in')).toBe('a.sha@example.in'))
})
