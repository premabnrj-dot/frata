import { describe, expect, it } from 'vitest'
import { CATALOGUE } from '../catalogue'
import { ManifestSchema, parseManifest } from '../manifest-schema'
import type { ThemeManifest } from '../types'

// Theme Studio TS0a: every code manifest parses to itself (a field the schema lacks fails here), and nothing that could
// leave a colour, a name or a token can carry CSS or markup (security review H1, 2026-11-11).

const all: ThemeManifest[] = Object.values(CATALOGUE).flatMap((vs) => Object.values(vs))
const plain = (x: unknown) => JSON.parse(JSON.stringify(x))

describe.each(all.map((m) => [`${m.key}@${m.version}`, m] as const))('%s', (_n, m) => {
  it('parses, and the parsed manifest is the manifest (parity)', () => {
    const r = ManifestSchema.safeParse(plain(m))
    expect(r.success ? [] : r.error.issues.slice(0, 3)).toEqual([])
    expect(plain(r.data)).toEqual(plain(m))
  })
})

describe('refuses what could leave its field', () => {
  const m = plain(all[0]) as ThemeManifest & Record<string, unknown>
  const bad = (path: (string | number)[], value: unknown) => {
    const x = plain(m); let o: Record<string | number, unknown> = x
    for (const k of path.slice(0, -1)) o = o[k] as Record<string | number, unknown>
    o[path.at(-1)!] = value
    return parseManifest(x)
  }
  it.each([
    ['a colour with a second declaration', ['styles', 0, 'schemes', 'paper', 'bg'], '#fff;background-image:url(https://evil.example/x)'],
    ['a colour that closes the rule', ['styles', 0, 'schemes', 'paper', 'accent'], '#000000}body{display:none'],
    ['a 3-digit colour', ['styles', 0, 'schemes', 'paper', 'text'], '#fff'],
    ['a colour with a trailing space', ['styles', 0, 'schemes', 'paper', 'text'], '#111111 '],
    ['a brand colour with url(', ['defaults', 'brandColour'], 'url(x)'],
    ['a style name with markup', ['styles', 0, 'name'], '</style><script>'],
    ['a theme name with braces', ['name'], 'Oxide { color: red }'],
    ['a token outside its list', ['defaults', 'corners'], 'circle'],
    ['an unknown key', ['allowed', 'css'], 'body{}'],
    ['an unknown top-level key', ['script'], 'alert(1)'],
    ['a style key the database refuses', ['styles', 0, 'key'], 'Oxide_1'],
    ['a home photo from a shop folder', ['home', 0, 'image'], { base: 'https://x.public.blob.vercel-storage.com/tenants/aaaa/theme/p', widths: [400], width: 800, height: 1000, alt: '' }],
  ])('%s', (_n, path, value) => {
    expect(bad(path as (string | number)[], value).ok).toBe(false)
  })
})

describe('free text is data, never markup', () => {
  it('a feature line with markup-like text renders escaped', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { createElement } = await import('react')
    const html = renderToStaticMarkup(createElement('p', null, 'Pages that rise in; <b>a</b> & more'))
    expect(html).toBe('<p>Pages that rise in; &lt;b&gt;a&lt;/b&gt; &amp; more</p>')
  })
})
