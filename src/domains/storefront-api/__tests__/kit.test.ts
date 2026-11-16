import { describe, expect, it } from 'vitest'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { starterCartLink } from '../../../../scripts/kit-sync.mjs'
import { Brand } from '../2026-12/schemas'

describe('the partner kit (SA1b D·9)', () => {
  it('the starter’s bag link is the app’s own, limits written in (node scripts/kit-sync.mjs)', () => {
    expect(readFileSync('kit/starter/lib/cart-link.ts', 'utf8')).toBe(starterCartLink())
  })
  it('the starter never reads its key in the browser', () => {
    const lib = readFileSync('kit/starter/lib/frrata.ts', 'utf8')
    expect(lib).toContain("import 'server-only'")
    expect(lib).not.toMatch(/NEXT_PUBLIC_/)
  })
  // The owner's Claude Code decision (2026-11-15): the starter's own check catches the mistakes whoever wrote the code.
  const check = (dir: string) => { try { execFileSync(process.execPath, ['scripts/check.mjs'], { cwd: dir, stdio: 'pipe' }); return '' } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? '') } }
  it('the starter passes its own check', () => { expect(check('kit/starter')).toBe('') })
  it('the check refuses a key in source, price arithmetic, HTML from the API and a missing legal block', () => {
    const dir = mkdtempSync(join(tmpdir(), 'starter-'))
    try {
      for (const d of ['app', 'components', 'lib', 'scripts']) cpSync(join('kit/starter', d), join(dir, d), { recursive: true })
      writeFileSync(join(dir, 'lib/bad.ts'), ["const k = 'frs_pub_" + "abcdef123456'", 'export const off = (p: { price: number }) => p.price * 0.9', 'export const html = <div dangerouslySetInnerHTML={{ __html: k }} />'].join('\n'))
      writeFileSync(join(dir, 'app/layout.tsx'), 'export default function L({ children }: { children: unknown }) { return children }')
      writeFileSync(join(dir, '.env.local'), 'FRRATA_KEY=frs_test_' + 'abcdef123456')
      const out = check(dir)
      expect(out.split('\n').filter((l) => l.startsWith('.env.local'))).toEqual([])
      for (const want of ['a Frrata key in source', 'arithmetic on a price', 'dangerouslySetInnerHTML', 'legal.grievanceOfficer']) expect(out).toContain(want)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  // One-address P1·7: the brand is the store's. A partner's site reads shop.brand; it never keeps a logo, colour or font.
  // Colour functions spelled in parts: check:hex reads this file too.
  const FN = { rgba: 'rg' + 'ba', mix: 'color' + '-mix' }
  const copy = () => {
    const dir = mkdtempSync(join(tmpdir(), 'starter-'))
    for (const d of ['app', 'components', 'lib', 'scripts']) cpSync(join('kit/starter', d), join(dir, d), { recursive: true })
    return dir
  }
  it('the check refuses a logo file, a header without <Logo> or with an inline SVG, and a colour or font of the site’s own', () => {
    const dir = copy()
    try {
      cpSync(join(dir, 'app/globals.css'), join(dir, 'app/x.css'))
      writeFileSync(join(dir, 'app/x.css'), `/* two\n   lines */\n.a { color: #8C1D2C }\n.b { font-family: \'Mukta\', sans-serif }\n.c { box-shadow: 0 1px 2px ${FN.rgba}(0,0,0,.1) }\n`)
      cpSync(join(dir, 'app'), join(dir, 'public'), { recursive: true })
      writeFileSync(join(dir, 'public/monogram.svg'), '<svg/>')
      writeFileSync(join(dir, 'public/logos-main.png'), '')
      writeFileSync(join(dir, 'components/hero.tsx'), "export const H = () => <p style={{ color: '#8C1D2C', fontFamily: 'Mukta' }}>x</p>")
      writeFileSync(join(dir, 'components/frrata/mine.tsx'), "export const M = () => <p style={{ color: '#000000' }}>x</p>")
      const layout = readFileSync(join(dir, 'app/layout.tsx'), 'utf8')
      writeFileSync(join(dir, 'app/layout.tsx'), layout.replace(/<Logo [^>]*\/>/, '<svg viewBox="0 0 1 1"/>').replace(/<BrandStyle [^>]*\/>/, ''))
      const out = check(dir)
      expect(out).toContain('public/monogram.svg: a logo file')
      expect(out).toContain('public/logos-main.png: a logo file')
      expect(out).toContain('the header must draw the store\'s logo with <Logo>')
      expect(out).toContain('an inline <svg> beside the header')
      expect(out).toContain('render <BrandStyle')
      expect(out).toContain('app/x.css:3: a colour set in the site') // the line number counts the comment's lines
      expect(out).toContain('app/x.css:4: a font of the site\'s own')
      expect(out).toContain('app/x.css:5: a colour set in the site')
      expect(out).toContain('components/hero.tsx:1: a colour in code')
      expect(out).toContain('components/hero.tsx:1: a font in code')
      expect(out).toContain('components/frrata/mine.tsx:1: a colour in code') // only the kit's own two files are exempt
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('the check lets ordinary site code through: id selectors, url(#…), generic fonts, a #fragment link, a lookbook photo, a bag icon in the nav', () => {
    const dir = copy()
    try {
      writeFileSync(join(dir, 'app/y.css'), `#faded { mask: url(#fade) }\n.n { font-family: ui-monospace, monospace }\n.u { font: unset }\n.s { box-shadow: 0 1px 2px ${FN.mix}(in srgb, var(--brand-text) 12%, transparent) }\n`)
      writeFileSync(join(dir, 'components/z.tsx'), 'export const Z = () => <a href="#add">Add</a>')
      cpSync(join(dir, 'app'), join(dir, 'public'), { recursive: true })
      writeFileSync(join(dir, 'public/brand-story-hero.jpg'), '')
      const layout = readFileSync(join(dir, 'app/layout.tsx'), 'utf8')
      writeFileSync(join(dir, 'app/layout.tsx'), layout.replace('<nav>', '<nav><svg viewBox="0 0 24 24" aria-hidden="true"/>'))
      expect(check(dir)).toBe('')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('the starter’s Brand type names every field shop.brand answers', () => {
    const lib = readFileSync('kit/starter/lib/frrata.ts', 'utf8')
    const type = lib.slice(lib.indexOf('export type Brand'))
    for (const k of [...Object.keys(Brand.shape), ...Object.keys(Brand.shape.logos.shape), ...Object.keys(Brand.shape.colours.shape), ...Object.keys(Brand.shape.fonts.shape)]) expect(type).toContain(`${k}:`)
    const style = readFileSync('kit/starter/components/frrata/brand-style.tsx', 'utf8')
    for (const d of Brand.shape.density.options) expect(style).toContain(`${d}:`)
  })
})
