import { describe, expect, it } from 'vitest'

describe('check:name', async () => {
  const { check } = await import('../check-name.mjs')
  it('finds the old name in strings, template text and JSX text, in any case', () => {
    const src = [
      "const a = 'Hi Frata, a question'",
      'const b = `Frata ${x} fee`',
      'const c = <p>New to Frata?</p>',
      "const d = 'FRATA support'",
    ].join('\n')
    expect(check(src, 'x.tsx').map((h: { line: number }) => h.line)).toEqual([1, 2, 3, 4])
  })
  it('never looks at comments, identifiers, import paths or the new name', () => {
    const src = [
      "import { frataWhatsappLink } from '@/lib/frata-site'",
      '// Frata used to be the name',
      'const frataCollects = FRATA_WHATSAPP',
      "const e = 'Frrata Admin'",
      "const f = 'ferrata'",
    ].join('\n')
    expect(check(src, 'x.tsx')).toEqual([])
  })
})
