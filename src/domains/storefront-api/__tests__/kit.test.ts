import { describe, expect, it } from 'vitest'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { starterCartLink, starterFrrataWords } from '../../../../scripts/kit-sync.mjs'
import { consoleOf, envFile, plain, pollStep, storeOf } from '../../../../kit/starter/scripts/frrata-dev-lib.mjs'
import { Brand } from '../2026-12/schemas'

describe('the partner kit (SA1b D·9)', () => {
  it('the starter’s bag link is the app’s own, limits written in (node scripts/kit-sync.mjs)', () => {
    expect(readFileSync('kit/starter/lib/cart-link.ts', 'utf8')).toBe(starterCartLink())
  })
  it('npm run frrata says the terminal’s words as Frrata’s device module has them (kit-sync)', () => {
    expect(readFileSync('kit/starter/scripts/frrata-words.mjs', 'utf8')).toBe(starterFrrataWords())
  })
  it('npm run frrata: the store, Frrata’s address, and each poll answer as the next step', () => {
    expect(envFile('# x\nFRRATA_STORE="house-of-ayuda"\nFRRATA_KEY=\n')).toEqual({ FRRATA_STORE: 'house-of-ayuda', FRRATA_KEY: '' })
    expect(storeOf(['house-of-ayuda'], {})).toBe('house-of-ayuda')
    expect(storeOf([], { FRRATA_STORE: 'Neel-Studio' })).toBe('neel-studio')
    expect(storeOf(['--x', '../etc'], {})).toBeNull()
    expect(consoleOf({})).toBe('https://frata.vercel.app')
    expect(plain('Code \u001b[2JHXKT\u0007')).toBe('Code [2JHXKT')
    expect(consoleOf({ FRRATA_CONSOLE_ORIGIN: 'http://localhost:3077/' })).toBe('http://localhost:3077')
    expect(consoleOf({ FRRATA_CONSOLE_ORIGIN: 'http://evil.test' })).toBe('https://frata.vercel.app')
    expect(pollStep(202, {}, 5)).toEqual({ next: 'wait', seconds: 5 })
    expect(pollStep(200, { key: 'frs_build_' + 'x'.repeat(38) }, 5)).toMatchObject({ next: 'key' })
    expect(pollStep(429, { message: 'Too many tries. Wait a minute, then run it again.' }, 5)).toEqual({ next: 'wait', seconds: 30, say: 'Too many tries. Wait a minute, then run it again.' })
    for (const [status, message] of [[409, 'The store has its limit of keys. Delete one first, then run it again.'], [404, 'This sign-in ended. Run `npm run frrata` again.'], [403, 'x']] as const)
      expect(pollStep(status, { message }, 5)).toEqual({ next: 'stop', say: message })
    expect(pollStep(0, {}, 5)).toEqual({ next: 'stop', say: 'Frrata could not answer. Try again in a minute.' })
  })
  it('npm run frrata: start, wait, the key to `next dev` in its environment only, never printed', async () => {
    const { createServer } = await import('node:http')
    const { spawn } = await import('node:child_process')
    const key = 'frs_build_' + 'K'.repeat(38)
    let polls = 0
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      if (req.url === '/api/dev/device/start') return res.end(JSON.stringify({ device: 'd'.repeat(43), code: 'HXKT-7P2M', interval: 0, message: 'Open localhost/partner/developer\nCode HXKT-7P2M ends in 10 minutes' }))
      polls++
      if (polls < 2) { res.statusCode = 202; return res.end(JSON.stringify({ status: 'pending' })) }
      res.end(JSON.stringify({ key, expiresAt: '2026-11-23T10:00:00Z' }))
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const port = (server.address() as { port: number }).port
    const dir = mkdtempSync(join(tmpdir(), 'frrata-dev-'))
    try {
      // A stand-in `next`: says what `next dev` would get, never the key itself.
      mkdirSync(join(dir, 'node_modules/next/dist/bin'), { recursive: true })
      writeFileSync(join(dir, 'package.json'), '{}')
      writeFileSync(join(dir, 'node_modules/next/package.json'), '{"name":"next"}')
      writeFileSync(join(dir, 'node_modules/next/dist/bin/next'), 'const k = process.env.FRRATA_KEY || ""\nconsole.log("args=next " + process.argv.slice(2).join(" "))\nconsole.log("has_key=" + (k ? "yes" : ""))\nconsole.log("mode=" + process.env.FRRATA_KEY_MODE)\nconsole.log("key_ok=" + (k.startsWith("frs_build_") ? 1 : 0))\n')
      const out = await new Promise<string>((resolve, reject) => {
        const c = spawn(process.execPath, [join(process.cwd(), 'kit/starter/scripts/frrata-dev.mjs'), 'house-of-ayuda'], {
          cwd: dir, env: { PATH: process.env.PATH, FRRATA_CONSOLE_ORIGIN: `http://localhost:${port}` } as unknown as NodeJS.ProcessEnv })
        let text = ''
        c.stdout.on('data', (d) => (text += d)); c.stderr.on('data', (d) => (text += d))
        c.on('exit', (code) => (code === 0 ? resolve(text) : reject(new Error(text))))
      })
      expect(out).toContain('Code HXKT-7P2M ends in 10 minutes')
      expect(out).toContain('Waiting for you to confirm…')
      expect(out).toContain('Signed in. This computer has a key for 24 hours.')
      expect(out).toContain('args=next dev')
      expect(out).toContain('has_key=yes')
      expect(out).toContain('mode=header')
      expect(out).toContain('key_ok=1')
      expect(out).not.toContain(key)
      expect(polls).toBe(2)
    } finally {
      server.close()
      rmSync(dir, { recursive: true, force: true })
    }
  }, 20_000)
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
      writeFileSync(join(dir, 'public/house-wordmark.svg'), '<svg/>')
      mkdirSync(join(dir, 'public/brand'), { recursive: true })
      writeFileSync(join(dir, 'public/brand/house-stacked.svg'), '<svg/>')
      writeFileSync(join(dir, 'components/hero.tsx'), "export const H = () => <p style={{ color: '#8C1D2C', fontFamily: 'Mukta' }}>x</p>")
      writeFileSync(join(dir, 'components/frrata/mine.tsx'), "export const M = () => <p style={{ color: '#000000' }}>x</p>")
      const layout = readFileSync(join(dir, 'app/layout.tsx'), 'utf8')
      writeFileSync(join(dir, 'app/layout.tsx'), layout.replace(/<Logo [^>]*\/>/, '<svg viewBox="0 0 1 1"/>').replace(/<BrandStyle [^>]*\/>/, ''))
      const out = check(dir)
      expect(out).toContain('public/monogram.svg: a logo file')
      expect(out).toContain('public/logos-main.png: a logo file')
      expect(out).toContain('public/house-wordmark.svg: a logo file')
      expect(out).toContain('public/brand/house-stacked.svg: a logo file')
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
  it('the check lets a header component through when the layout hands it <Logo>', () => {
    const dir = copy()
    try {
      const layout = readFileSync(join(dir, 'app/layout.tsx'), 'utf8')
      const header = /<header\b[\s\S]*?<\/header>/.exec(layout)![0]
      writeFileSync(join(dir, 'components/site-header.tsx'), "export const SiteHeader = ({ logo }: { logo: React.ReactNode }) => <header className=\"top\">{logo}</header>")
      writeFileSync(join(dir, 'app/layout.tsx'), layout.replace(header, '<SiteHeader logo={' + /<Logo [^>]*\/>/.exec(header)![0] + '} />'))
      expect(check(dir)).toBe('')
      writeFileSync(join(dir, 'app/layout.tsx'), layout.replace(header, '<SiteHeader logo={null} />'))
      expect(check(dir)).toContain('the header must draw the store\'s logo with <Logo>')
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
