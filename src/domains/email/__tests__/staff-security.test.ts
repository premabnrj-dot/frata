import { describe, expect, it } from 'vitest'
import { staffSecurityWords } from '../staff-security'

describe('staff security emails', () => {
  it('names who did what to whom, for every kind', () => {
    expect(staffSecurityWords({ kind: 'request_approved', about: 'ravi@frrata.com', by: 'asha@frrata.com', detail: null }))
      .toEqual({ subject: 'A new passkey was approved for ravi@frrata.com', body: expect.stringContaining('asha@frrata.com approved a request from ravi@frrata.com') })
    expect(staffSecurityWords({ kind: 'passkey_added', about: 'ravi@frrata.com', by: 'ravi@frrata.com', detail: "Ravi's phone" }).body).toContain('"Ravi\'s phone"')
    expect(staffSecurityWords({ kind: 'staff_removed', about: 'x@frrata.com', by: null, detail: null }).body).toMatch(/^Frrata removed x@frrata.com/)
    for (const kind of ['staff_added', 'staff_removed', 'request_approved', 'passkey_added', 'passkey_removed'] as const) {
      const w = staffSecurityWords({ kind, about: 'a@b.c', by: 'd@e.f', detail: 'n' })
      expect(w.subject.length).toBeGreaterThan(5)
      expect(w.body.length).toBeGreaterThan(5)
    }
  })
})
