// THE UX GATES, proven on planted bad lines (plan U·1b): each must fail what it guards and pass what it allows.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { check } from '../check-contrast.mjs'
import { compare, scan } from '../check-scale.mjs'

const dir = mkdtempSync(join(tmpdir(), 'ux-gates-'))
const file = (name: string, text: string) => { const p = join(dir, name); writeFileSync(p, text); return p }

describe('check:contrast', () => {
  it('passes the real tokens, light and dark', () => {
    expect(check(readFileSync('src/app/globals.css', 'utf8'))).toEqual([])
  })
  it('fails the old field edge (1.72:1), a dark token left undefined, and a colour in no pair', () => {
    const css = readFileSync('src/app/globals.css', 'utf8')
      .replace('--input: #8C857F;', '--input: #C9C5C0;')
      .replace(/(:root\[data-theme="dark"\] \{[^}]*?)\n {2}--ring: #EDEAE6;/, '$1')
      .replace('--radius: 0.375rem;', '--radius: 0.375rem; --sparkle: #FF00FF;')
    const p: string[] = check(css)
    expect(p.some((x) => /light: --input on --card is 1\.72:1/.test(x))).toBe(true)
    expect(p.some((x) => /dark: --ring is not defined/.test(x))).toBe(true)
    expect(p.some((x) => /--sparkle is a colour in no pair/.test(x))).toBe(true)
  })
})

describe('check:scale', () => {
  const planted = file('planted.tsx', [
    '<h2 className="text-[15px] font-semibold">Team</h2>',
    '<section className="space-y-3 rounded-md border border-border bg-card p-5">',
    '<input id="q" className="h-9 rounded-md border border-input" />',
    '<input id="ok" className="h-10 md:h-9 rounded-md" />',
    '// text-[15px] in a comment never trips the gate',
  ].join('\n'))
  it('finds a pixel font size, an inline card frame and a 36 px field, not a comment or h-10 md:h-9', () => {
    const found = scan([planted]) as Record<string, number>
    const byRule = Object.fromEntries(Object.entries(found).map(([key, n]) => [key.split(' · ')[1], n]))
    expect(byRule).toEqual({ 'text-px': 1, 'card-frame': 1, 'field-h9': 1 })
  })
  it('reads a field across lines and past an => in its handlers', () => {
    const multi = file('multi.tsx', '<input\n  value={v}\n  onChange={(e) => set(e.target.value)}\n  className="h-9 w-full"\n/>\n<select className="h-10 md:h-9"></select>\n')
    expect(scan([multi])).toEqual({ [Object.keys(scan([multi]))[0]!]: 1 })
    expect(Object.keys(scan([multi]))[0]).toMatch(/· field-h9$/)
  })
  it('refuses a path that does not exist (a typo must not pass as clean)', () => {
    expect(() => execFileSync('node', ['scripts/check-scale.mjs', 'no/such/dir'], { stdio: 'pipe' })).toThrow()
    expect(() => execFileSync('node', ['scripts/check-contrast.mjs', 'no/such.css'], { stdio: 'pipe' })).toThrow()
  })
  it('the allow list only shrinks: more fails, fewer asks for the line to be lowered', () => {
    expect(compare({ 'a.tsx · text-px': 2 }, '1 a.tsx · text-px')).toEqual(['a.tsx · text-px: 2 (allowed 1)'])
    expect(compare({ 'a.tsx · text-px': 1 }, '2 a.tsx · text-px')[0]).toMatch(/now 1, lower its line/)
    expect(compare({ 'a.tsx · text-px': 1 }, '1 a.tsx · text-px')).toEqual([])
  })
})

describe('check:hex', () => {
  it('fails a colour function outside globals.css, and skips comments', () => {
    const bad = file('bad.tsx', 'const shadow = "shadow-[0_0_0_1px_rgba(0,0,0,.5)]"\n')
    const quiet = file('quiet.tsx', '// rgba( is only mentioned here\nexport const x = 1\n')
    expect(() => execFileSync('node', ['scripts/check-hex.mjs', bad], { stdio: 'pipe' })).toThrow()
    expect(execFileSync('node', ['scripts/check-hex.mjs', quiet], { stdio: 'pipe' }).toString()).toMatch(/clean/)
  })
})
