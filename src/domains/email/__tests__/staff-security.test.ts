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
  it('passkeys off or on for everyone name the master admin (drizzle/0171)', () => {
    expect(staffSecurityWords({ kind: 'passkeys_off', about: 'asha@frrata.com', by: 'asha@frrata.com', detail: null }))
      .toEqual({ subject: 'Passkeys are off for all staff and partners', body: expect.stringMatching(/^asha@frrata.com turned passkeys off\. .*email code alone/) })
    expect(staffSecurityWords({ kind: 'passkeys_on', about: 'asha@frrata.com', by: null, detail: null }).body).toMatch(/^asha@frrata.com turned passkeys on\./)
  })
  it('a role change names the new role and that the stores stay (T1c)', () => {
    expect(staffSecurityWords({ kind: 'partner_role_changed', about: 'meera@pixelthread.in', by: 'ananya@pixelthread.in', detail: 'Builder' }))
      .toEqual({ subject: 'meera@pixelthread.in is now a Builder', body: 'ananya@pixelthread.in made meera@pixelthread.in a Builder. Their stores stay the same.' })
  })
})
