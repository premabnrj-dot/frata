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
  it('fails a height class handed to a button, not its size variant', () => {
    const b = file('btn.tsx', '<Button className="h-11 w-full">Go</Button>\n<Link className={button({ className: \'h-8\' })} />\n<Button size="lg" className="w-full" />\n')
    expect(Object.entries(scan([b]) as Record<string, number>).map(([k, n]) => [k.split(' · ')[1], n])).toEqual([['button-h', 2]])
    const quiet = file('btn-ok.tsx', '// <Button className="h-11">\n<Button className="min-h-12 w-full" aria-label="h-1 tall">Go</Button>\n')
    expect(scan([quiet])).toEqual({})
  })
  it('button-h: a height beside button() in a template or cn(), and never reads past the call', () => {
    const t = file('btn-forms.tsx', [
      '<Link className={`${button()} h-11`} />',
      '<Link className={`${button()} h-auto min-h-10`} />',
      "<Link className={cn(button(), 'h-11')} />",
      '<Button disabled={n < 1} className="h-[44px]">Go</Button>',
      "<Link className={button({ variant: 'secondary' })}>Edit</Link><input className=\"h-10 md:h-9\" /><div className=\"h-8\" />",
      '<Button size="wrap" className="min-h-11 w-full">Open a very long merchant name console</Button>',
    ].join('\n'))
    expect(scan([t])).toEqual({ [Object.keys(scan([t]))[0]!]: 4 })
    expect(Object.keys(scan([t]))[0]).toMatch(/· button-h$/)
  })
  it('card-frame: a flush card counts; its skips are the element\'s own classes, not the line', () => {
    const t = file('frames.tsx', [
      '<section className="rounded-md border border-border bg-card">flush</section>',
      '<div className="rounded-md border border-border bg-card"><span className="absolute">x</span></div>',
      '<ul className="absolute rounded-md border border-border bg-card shadow-md" />',
      '<details className="group rounded-md border border-border bg-card" />',
      '<div className="overflow-x-auto rounded-md border border-border bg-card"><table /></div>',
    ].join('\n'))
    expect(scan([t])).toEqual({ [Object.keys(scan([t]))[0]!]: 2 })
    expect(Object.keys(scan([t]))[0]).toMatch(/· card-frame$/)
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

describe('check:motion', async () => {
  const { check } = await import('../check-motion.mjs')
  it('fails layout transitions, transition-all and arbitrary timings; skips comments', () => {
    const tsx = [
      '<div className="h-full transition-[width] duration-slow" />',
      '<div className="transition-[max-height,opacity]" />',
      '<div className="transition-all" />',
      '<div className="duration-[1400ms] ease-[cubic-bezier(0,0,0,1)] animate-[spin_1s]" />',
      '// transition-[width] in a comment is fine',
      '<div className="origin-left transition-transform duration-slow" style={{ transform: `scaleX(0.5)` }} />',
    ].join('\n')
    const p: string[] = check(tsx, false)
    expect(p.filter((x) => x.startsWith('layout:')).length).toBe(3)
    expect(p.filter((x) => x.startsWith('arbitrary:')).length).toBe(3)
  })
  it('in CSS: keyframes that move layout, animations over 400 ms, layout transitions; named exceptions pass', () => {
    const css = [
      '@keyframes grow { from { height: 0; } to { height: 100px; } }',
      '@keyframes fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }',
      '@keyframes draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }',
      '@utility animate-slow { animation: fade 600ms ease; }',
      '@utility animate-ok { animation: fade 320ms ease; }',
      '@utility animate-undo { animation: undo-window 8s linear forwards; }',
      '.panel { transition: height 200ms ease; }',
      '.ok { transition: opacity var(--transition-duration-base) var(--ease-exit), display 200ms allow-discrete; }',
    ].join('\n')
    expect(check(css, true).sort()).toEqual(['keyframes: grow animates height', 'layout: transition: height 200ms ease', 'too-long: fade 600ms (nothing over 400 ms)'].sort())
  })
  it('catches what a line-by-line read missed: inline styles, delay-[…], long durations, all, multi-line and longhand CSS, exceptions past their own limits', () => {
    const tsx = [
      "<div style={{ transition: 'width 200ms ease' }} />",
      '<div className="delay-[50ms] duration-1000 transition-[grid-template-rows]" />',
      '<div className="duration-300 transition-opacity" />',
    ].join('\n')
    expect(check(tsx, false).sort()).toEqual(["layout: style transition 'width 200ms ease'", 'arbitrary: delay-[50ms]', 'arbitrary: duration-1000 (use duration-fast|base|slow)', 'layout: transition-[grid-template-rows]'].sort())
    const css = [
      '.a { transition: all 200ms; }',
      '.b { transition: opacity 200ms,',
      '  margin-top 200ms }',
      '.c { transition-duration: 600ms; animation-duration: 0.01ms !important; }',
      '.d { animation: 600ms ease fade; }',
      '@keyframes draw { from { width: 0; stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }',
      '.e { animation: draw 5s both; }',
      '.f { animation: nav-run 1400ms linear; }',
    ].join('\n')
    expect(check(css, true).sort()).toEqual([
      'layout: transition: all 200ms',
      'layout: transition: opacity 200ms, margin-top 200ms',
      'too-long: transition-duration: 600ms (nothing over 400 ms)',
      'too-long: fade 600ms (nothing over 400 ms)',
      'keyframes: draw animates width',
      'too-long: draw 5000ms (its limit is 400 ms)',
    ].sort())
  })
})
