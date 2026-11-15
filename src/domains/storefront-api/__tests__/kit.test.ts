import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { starterCartLink } from '../../../../scripts/kit-sync.mjs'

describe('the partner kit (SA1b D·9)', () => {
  it('the starter’s bag link is the app’s own, limits written in (node scripts/kit-sync.mjs)', () => {
    expect(readFileSync('kit/starter/lib/cart-link.ts', 'utf8')).toBe(starterCartLink())
  })
  it('the starter never reads its key in the browser', () => {
    const lib = readFileSync('kit/starter/lib/frrata.ts', 'utf8')
    expect(lib).toContain("import 'server-only'")
    expect(lib).not.toMatch(/NEXT_PUBLIC_/)
  })
})
