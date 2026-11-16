import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// =============================================================================
// The move out of the look (V1 content, plan docs/plans/2026-11-15-v1-content.md § The move): no code reads the bar,
// the menus or the Contact line from a look any more, and only Console › Content's actions (and the move's migration)
// write a store's content rows. Comment lines are skipped (a gate must not match its own documentation); this file is
// scanned like any other.
// =============================================================================

const ROOT = join(__dirname, '../../../..')
const SRC = join(ROOT, 'src')
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [] })
}
/** Code lines only: comments, and the samples this file proves the patterns on (marked `gate-sample`), are skipped. */
const code = (p: string) => readFileSync(p, 'utf8').split('\n').map((l, i) => ({ l, n: i + 1 })).filter(({ l }) => !/^\s*(\/\/|\*|\/\*)/.test(l) && !l.includes('gate-sample'))
const ALL = files(SRC)

/** Reading the moved parts off a look, a resolved theme or its settings. */
const READERS = [
  /\b(layer|theme|resolved|draft|live|stored|t)\.(menus|contact)\b/,
  /\bsettings\??\.announcement\b/,
  /\b(s|d|want|mine|defaults)\.announcement\b/,
  /\breadMenus\(/,
  /\bmenusProblem\(/,
]
/** Writing a store's content rows (site_content, shop_pages). */
const WRITERS = /\b(insert|update|delete)\((siteContent|shopPages)\)/
const WRITER_FILES = new Set(['src/app/(console)/console/content/actions.ts'])

describe('the move out of the look (V1 content)', () => {
  it('no reader of the look\'s menus, Contact line or bar remains', () => {
    const hits = ALL.flatMap((p) => code(p).filter(({ l }) => READERS.some((r) => r.test(l))).map(({ l, n }) => `${relative(ROOT, p)}:${n}  ${l.trim()}`))
    expect(hits).toEqual([])
  })
  it('only Console › Content writes content rows', () => {
    const hits = ALL.filter((p) => !p.includes('__tests__') && !WRITER_FILES.has(relative(ROOT, p)))
      .flatMap((p) => code(p).filter(({ l }) => WRITERS.test(l)).map(({ l, n }) => `${relative(ROOT, p)}:${n}  ${l.trim()}`))
    expect(hits).toEqual([])
  })
  it('the patterns catch what they are for', () => {
    for (const l of ['const m = layer.menus', 'theme.contact?.line', 'if (s.announcement)', 'settings.announcement ?? null', 'readMenus(raw)']) expect(READERS.some((r) => r.test(l))).toBe(true) // gate-sample
    for (const l of ['content.menus.main', 'content.contact', 'x.announcementBar']) expect(READERS.some((r) => r.test(l))).toBe(false)
    expect(WRITERS.test('await tx.update(shopPages).set({})')).toBe(true) // gate-sample
  })
})
