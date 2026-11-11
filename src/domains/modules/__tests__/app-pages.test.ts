import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MODULE_KEYS, MODULES } from '../registry'

// An app with a home of its own (a static folder under /console/apps, which wins over [app]) must show the app's
// page while it isn't in use, or the gallery's card would lead to a dead end (architecture review A4, 2026-11-11).
describe('every app page describes the app while it is off', () => {
  for (const k of MODULE_KEYS) {
    const file = `src/app/(console)/console/apps/${k}/page.tsx`
    if (!existsSync(file)) continue
    it(`${k} renders AppAbout when not usable`, () => {
      expect(MODULES[k].setup, `${k} has its own folder, so it declares setup`).toBe(`/console/apps/${k}`)
      expect(readFileSync(file, 'utf8')).toMatch(/<AppAbout\b/)
    })
  }
})

// GST's page is the accountant's screen: its first gate admits every console role, and CAN_SEE_GST decides after the
// about page (security review M1, 2026-11-11: ANY_MEMBER left the accountant out).
it('GST admits the accountant at its first gate', () => {
  expect(readFileSync('src/app/(console)/console/apps/gst/page.tsx', 'utf8')).toMatch(/requireMember\(CONSOLE_ROLES\)/)
})
